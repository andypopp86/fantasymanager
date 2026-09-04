import { db } from "./db";
import { sendOrQueue, sendOrQueueWithResponse } from "./writeQueue";
import type { PlayerDetail, SlotName } from "./draft.schemas";

// THE mutation seam: every local data change goes through here as one Dexie
// transaction paired with its API call. Components never write Dexie or call
// pick/budget/watch endpoints directly. API calls route through the
// writeQueue: sent directly when the server is reachable, queued in the
// pending_writes log and replayed FIFO when it isn't.
//
// Ordering semantics preserved from the pre-Dexie code:
// - submitPick is SERVER-FIRST (the server validates slots/limits and the
//   caller alerts on rejection) — but if the server is UNREACHABLE the pick
//   is accepted optimistically and queued: losing picks mid-draft is worse
//   than a rare replay rejection (hydration reconciles those).
// - everything else is OPTIMISTIC (local rows first, API sent/queued after).

// Register a pick with the server, then flip the local row to drafted (they
// leave the available list by definition) and drop them from the watchlist.
// Budget bookkeeping is NOT done here — see draftPlayer/the conflict-modal
// path, which arrange the budget BEFORE submitting (the server's submit view
// reads the budget slot to record PlanChanges).
export const submitPick = async (
    draftId: number,
    managerId: number,
    player: PlayerDetail,
    price: number,
    slot: SlotName,
): Promise<string | null> => {
    const result = await sendOrQueueWithResponse(draftId, "submit_pick", {
        draftId,
        managerId,
        playerId: player.player_id,
        price,
        slot,
    });
    if ("response" in result) {
        const errMsg = result.response.data["error"];
        if (errMsg != null) return errMsg;
    }

    await db.transaction("rw", db.draft_picks, db.watch_picks, db.budget_picks, async () => {
        await db.draft_picks.update([draftId, player.player_id], {
            drafted: true,
            manager_id: managerId,
            price,
            slot,
        });
        await db.watch_picks.delete([draftId, player.player_id]);
        // Budget tracks real spend: if this player is on the budgeted plan,
        // record the winning price (actual_price wins over projected in the
        // slot display and budgetSpent). No-op when there's no budget row —
        // draftPlayer unbudgets stolen targets before submitting.
        await db.budget_picks.update([draftId, player.player_id], { actual_price: price });
    });
    return null;
};

// The straightforward (non-conflicting) draft flow: mirror the pick into the
// drafter's budget first (or, when an opponent wins a budgeted target, drop
// the target from the plan), then submit.
export const draftPlayer = async (
    draftId: number,
    drafterId: number,
    managerId: number,
    player: PlayerDetail,
    price: number,
    slot: SlotName,
    budgetedSlotForPlayer: SlotName | null,
): Promise<string | null> => {
    const isDrafter = managerId === drafterId;
    if (isDrafter) {
        await budgetPick(draftId, drafterId, player, slot, price);
    } else if (budgetedSlotForPlayer) {
        await unbudgetPick(draftId, drafterId, player.player_id);
    }
    return submitPick(draftId, managerId, player, price, slot);
};

// Undraft: the row flips back to available. The budget row (if any) is kept,
// matching pre-Dexie behavior — the plan still targets the player.
export const unsubmitPick = async (draftId: number, managerId: number, playerId: number | string) => {
    await db.draft_picks.update([draftId, playerId], {
        drafted: false,
        manager_id: null,
        price: null,
        slot: null,
    });
    // Kept budget row goes back to tracking the projection.
    await db.budget_picks.update([draftId, playerId], { actual_price: 0 });
    sendOrQueue(draftId, "unsubmit_pick", { draftId, managerId, playerId });
};

// Budget a player at a slot. One budget row per player (server semantics:
// re-budgeting MOVES the row), and the target slot is cleared first.
export const budgetPick = async (
    draftId: number,
    drafterId: number,
    player: { player_id: number | string, name?: string, player_name?: string, position: string },
    slot: SlotName,
    projectedPrice: number | string,
) => {
    await db.transaction("rw", db.budget_picks, async () => {
        await db.budget_picks.where("[draftId+slot]").equals([draftId, slot]).delete();
        await db.budget_picks.delete([draftId, player.player_id]);
        await db.budget_picks.put({
            draftId,
            player_id: player.player_id,
            slot,
            player_name: player.name || player.player_name || "",
            position: player.position,
            projected_price: projectedPrice,
            actual_price: 0,
            status: "budgeted",
        });
    });
    await sendOrQueue(draftId, "budget_pick", {
        draftId,
        managerId: drafterId,
        playerId: player.player_id,
        projectedPrice,
        slot,
    });
};

export const unbudgetPick = async (draftId: number, drafterId: number, playerId: number | string) => {
    await db.budget_picks.delete([draftId, playerId]);
    await sendOrQueue(draftId, "unbudget_pick", { draftId, managerId: drafterId, playerId });
};

// Merge a DraftPlan into the budget: for each slot the user checked, drop the
// current occupant (its server row would otherwise still claim the slot and
// reappear on refetch) and budget the plan's player there. Sequential so the
// unbudget lands before the replacement for the same slot.
export const applyPlanSelections = async (
    draftId: number,
    drafterId: number,
    selections: {
        slot: SlotName,
        player: { player_id: number | string, name: string, position: string },
        projectedPrice: number | string,
    }[],
) => {
    for (const { slot, player, projectedPrice } of selections) {
        const occupant = await db.budget_picks.where("[draftId+slot]").equals([draftId, slot]).first();
        if (occupant && String(occupant.player_id) !== String(player.player_id)) {
            await unbudgetPick(draftId, drafterId, occupant.player_id);
        }
        await budgetPick(draftId, drafterId, player, slot, projectedPrice);
    }
};

// Apply an arbitrary rearrangement of the budget in one go: any number of
// players leaving, moving between slots, or joining. Used by the tier → budget
// editor, which stages a whole plan before committing it.
//
// `unbudget` is REMOVALS ONLY. A player who merely moves is re-budgeted at the
// new slot and nothing more — the server's budget_pick get_or_creates on
// (draft, manager, player), so it MOVES the existing row. Unbudgeting a mover
// first would actually corrupt things: unbudget_pick nulls the row's manager,
// so the following budget_pick no longer matches it and creates a SECOND row.
//
// Removals go first so a slot someone is moving into isn't still claimed by the
// player leaving it. Callers must preserve the staging invariant: every
// displaced player is either re-placed or listed for removal, never dropped
// silently — `budgetPick` clears the target slot only in Dexie, with no server
// counterpart, so an orphan row would reclaim its slot on the next hydrate.
export const applyBudgetChanges = async (
    draftId: number,
    drafterId: number,
    changes: {
        unbudget: (number | string)[],
        place: {
            slot: SlotName,
            player: { player_id: number | string, name: string, position: string },
            projectedPrice: number | string,
        }[],
    },
) => {
    // Sequential, not Promise.all: the write queue replays FIFO, and a place
    // that reached the server before the removals would be racing them.
    for (const playerId of changes.unbudget) {
        await unbudgetPick(draftId, drafterId, playerId);
    }
    for (const { slot, player, projectedPrice } of changes.place) {
        await budgetPick(draftId, drafterId, player, slot, projectedPrice);
    }
};

// ---- Backups (LOCAL ONLY) -------------------------------------------------
// Every BUDGET slot has its own shelf of alternates, addressed by
// (slot, rank): the WR1 shelf holds who takes WR1 if the WR1 target is gone.
// There is no endpoint, no BudgetPlayer row, and nothing enters the offline
// write queue — these are the only mutations here that never talk to the
// server (promoteBackup being the exception, since it also writes the budget).
//
// One row per CELL, not per player (lib/db.ts v7): the same player may back up
// several slots at once — a handcuff RB legitimately stands behind both RB1 and
// RB2 — so parking someone leaves every other cell holding them untouched. The
// target cell's own occupant is still replaced: the UI shows cell contents, so
// dropping onto a full cell is a deliberate overwrite.
export const backupPick = async (
    draftId: number,
    player: { player_id: number | string, name?: string, player_name?: string, position: string },
    slot: SlotName,
    rank: number,
    projectedPrice: number | string,
) => {
    await db.backup_cells.put({
        draftId,
        player_id: player.player_id,
        slot,
        rank,
        player_name: player.name || player.player_name || "",
        position: player.position,
        projected_price: projectedPrice,
    });
};

// Seed a slot's whole shelf from a DraftPlan's saved backups — the plan half of
// the feature landing back on the board. The plan is the authority for the slots
// being merged, so each named slot's shelf is REPLACED (its existing cells go
// first): a half-merged shelf would be a plan nobody authored. Slots absent from
// `shelves` keep whatever they hold.
//
// Local like every other backup write: the plan's copy came from the server, the
// board's stays in this browser.
export const seedBackupsFromPlan = async (
    draftId: number,
    shelves: {
        slot: SlotName,
        cells: { rank: number, player: { player_id: number | string, name: string, position: string }, projectedPrice: number | string }[],
    }[],
) => {
    await db.transaction("rw", db.backup_cells, async () => {
        for (const { slot, cells } of shelves) {
            await db.backup_cells.where("[draftId+slot]").equals([draftId, slot]).delete();
            for (const { rank, player, projectedPrice } of cells) {
                await db.backup_cells.put({
                    draftId,
                    player_id: player.player_id,
                    slot,
                    rank,
                    player_name: player.name,
                    position: player.position,
                    projected_price: projectedPrice,
                });
            }
        }
    });
};

// Clears ONE cell. Addressed by (slot, rank) rather than by player, because a
// player may sit in several cells and only the one clicked should empty.
export const unbackupPick = async (draftId: number, slot: SlotName, rank: number) => {
    await db.backup_cells.delete([draftId, slot, rank]);
};

// Drag a backup from one cell to another. A move, not a copy: the source cell
// empties. If the destination is occupied the two SWAP, so a drag onto a full
// cell reorders the shelf instead of throwing a player away.
export const moveBackup = async (
    draftId: number,
    from: { slot: SlotName, rank: number },
    to: { slot: SlotName, rank: number },
) => {
    if (from.slot === to.slot && from.rank === to.rank) return;
    await db.transaction("rw", db.backup_cells, async () => {
        const source = await db.backup_cells.get([draftId, from.slot, from.rank]);
        if (!source) return;
        const target = await db.backup_cells.get([draftId, to.slot, to.rank]);
        await db.backup_cells.put({ ...source, slot: to.slot, rank: to.rank });
        if (target) {
            await db.backup_cells.put({ ...target, slot: from.slot, rank: from.rank });
        } else {
            await db.backup_cells.delete([draftId, from.slot, from.rank]);
        }
    });
};

// Promote a backup off its shelf cell (`from`) into a budget slot (`toSlot`) —
// the whole point of the shelf. Dragging is the only way in: `toSlot` is
// usually the slot the cell sits beside, but a backup can be dropped on any
// budget row whose positions it satisfies.
//
// It is a SWAP, not a replacement: whoever held the budget slot lands in the
// cell the promoted player just vacated, so the plan never loses a player it
// had picked out (and dragging them back swaps them straight back).
// `occupant` may be null, in which case this is a plain placement.
//
// The budget half goes through applyBudgetChanges to inherit its ordering
// contract (removals before placements, sequential so the write queue replays
// them in that order). The occupant is genuinely LEAVING the budget, so
// unbudgeting them is correct here — see the "removals only, never movers"
// note above.
export const promoteBackup = async (
    draftId: number,
    drafterId: number,
    from: { slot: SlotName, rank: number },
    toSlot: SlotName,
    backup: { player_id: number | string, player_name: string, position: string, projected_price: number | string },
    occupant: { player_id: number | string, player_name: string, position: string, projected_price: number | string } | null,
) => {
    await applyBudgetChanges(draftId, drafterId, {
        unbudget: occupant ? [occupant.player_id] : [],
        place: [{
            slot: toSlot,
            player: { player_id: backup.player_id, name: backup.player_name, position: backup.position },
            projectedPrice: backup.projected_price,
        }],
    });
    // Local shelf second: if the budget writes throw, the shelf still reads the
    // way the user left it rather than half-applied. Only the cell dragged FROM
    // is touched — the promoted player may back up other slots too, and those
    // shelves are still valid.
    if (occupant) {
        await db.backup_cells.put({
            draftId,
            player_id: occupant.player_id,
            slot: from.slot,
            rank: from.rank,
            player_name: occupant.player_name,
            position: occupant.position,
            projected_price: occupant.projected_price,
        });
    } else {
        await db.backup_cells.delete([draftId, from.slot, from.rank]);
    }
};

export const watchPick = async (
    draftId: number,
    managerId: number,
    player: { player_id: number | string, name: string, position: string },
    projectedPrice: number | string,
) => {
    await db.watch_picks.put({
        draftId,
        player_id: player.player_id,
        name: player.name,
        position: player.position,
        projected_price: projectedPrice,
    });
    sendOrQueue(draftId, "watch", { draftId, managerId, playerId: player.player_id, watch: true });
};

export const unwatchPick = async (draftId: number, managerId: number, playerId: number | string) => {
    await db.watch_picks.delete([draftId, playerId]);
    sendOrQueue(draftId, "watch", { draftId, managerId, playerId, watch: false });
};

// Tri-state cycle: neutral (null) -> target (true) -> avoid (false) -> neutral.
// Mirrors the server's cycle so the optimistic value matches what a queued
// replay will produce.
export const cycleFavorite = (favorite: boolean | null | undefined): boolean | null =>
    favorite == null ? true : favorite ? false : null;

// Server-first like submitPick: the server cycles from its own current value
// and the row takes what it actually returns — unless the write got queued,
// in which case the locally-cycled value applies optimistically.
export const setFavorite = async (draftId: number, playerId: number | string) => {
    const row = await db.draft_picks.get([draftId, playerId]);
    const optimistic = cycleFavorite(row?.player?.favorite);
    const result = await sendOrQueueWithResponse(draftId, "favorite", { draftId, playerId });
    const confirmed = "response" in result ? result.response.data["favorite"] : optimistic;
    if (row) {
        await db.draft_picks.update([draftId, playerId], {
            player: { ...row.player, favorite: confirmed },
        });
    }
    return confirmed;
};

// Re-slot a manager's drafted players. assignments: { slotName: player_id }.
export const reslotPicks = async (draftId: number, managerId: number, assignments: Record<string, number | string>) => {
    const slotByPlayer = Object.fromEntries(
        Object.entries(assignments).map(([slot, playerId]) => [String(playerId), slot]),
    );
    await db.transaction("rw", db.draft_picks, async () => {
        const rows = await db.draft_picks.where("[draftId+manager_id]").equals([draftId, managerId]).toArray();
        await Promise.all(rows.map((row) =>
            db.draft_picks.update([draftId, row.player_id], {
                slot: slotByPlayer[String(row.player_id)] ?? row.slot,
            })
        ));
    });
    sendOrQueue(draftId, "reslot_picks", { draftId, managerId, assignments });
};

export const reslotBudget = async (draftId: number, drafterId: number, assignments: Record<string, number | string>) => {
    const slotByPlayer = Object.fromEntries(
        Object.entries(assignments).map(([slot, playerId]) => [String(playerId), slot]),
    );
    await db.transaction("rw", db.budget_picks, async () => {
        const rows = await db.budget_picks.where("draftId").equals(draftId).toArray();
        await Promise.all(rows.map((row) =>
            db.budget_picks.update([draftId, row.player_id], {
                slot: slotByPlayer[String(row.player_id)] ?? row.slot,
            })
        ));
    });
    sendOrQueue(draftId, "reslot_budget", { draftId, managerId: drafterId, assignments });
};

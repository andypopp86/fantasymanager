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

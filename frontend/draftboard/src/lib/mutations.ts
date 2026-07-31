import { db } from "./db";
import {
    draftPickSubmit,
    draftPickUnsubmit,
    draftBudgetPick,
    draftUnbudgetPick,
    draftWatchPick,
    draftReslotPicks,
    draftReslotBudget,
    favoritePlayer,
} from "./data";
import type { PlayerDetail, SlotName } from "./draft.schemas";

// THE mutation seam: every local data change goes through here as one Dexie
// transaction paired with its API call. Components never write Dexie or call
// pick/budget/watch endpoints directly. A future offline write-queue replaces
// the direct API calls in this file (enqueue + flush) and nothing else moves.
//
// Ordering semantics preserved from the pre-Dexie code:
// - submitPick is SERVER-FIRST (the server validates slots/limits; the local
//   rows only change once it accepts, and the caller alerts on error).
// - everything else is OPTIMISTIC (local rows first, API fired after).

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
    const response = await draftPickSubmit(draftId, managerId, player.player_id, {
        price,
        position_slot: slot,
    });
    const errMsg = response.data["error"];
    if (errMsg != null) return errMsg;

    await db.transaction("rw", db.draft_picks, db.watch_picks, async () => {
        await db.draft_picks.update([draftId, player.player_id], {
            drafted: true,
            manager_id: managerId,
            price,
            slot,
        });
        await db.watch_picks.delete([draftId, player.player_id]);
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
    draftPickUnsubmit(draftId, managerId, playerId);
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
    draftBudgetPick(draftId, drafterId, player.player_id, {
        projected_price: projectedPrice,
        budget_position: slot,
    });
};

export const unbudgetPick = async (draftId: number, drafterId: number, playerId: number | string) => {
    await db.budget_picks.delete([draftId, playerId]);
    draftUnbudgetPick(draftId, drafterId, playerId);
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
    draftWatchPick(draftId, managerId, player.player_id, { watch: true });
};

export const unwatchPick = async (draftId: number, managerId: number, playerId: number | string) => {
    await db.watch_picks.delete([draftId, playerId]);
    draftWatchPick(draftId, managerId, playerId, { watch: false });
};

// Server-first like submitPick: the server may override the requested value,
// so the row is updated with what it actually returns.
export const setFavorite = async (draftId: number, playerId: number | string, favorite: boolean) => {
    const response = await favoritePlayer(draftId, playerId, { favorite });
    const confirmed = response.data["favorite"];
    const row = await db.draft_picks.get([draftId, playerId]);
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
    draftReslotPicks(draftId, managerId, { assignments });
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
    draftReslotBudget(draftId, drafterId, { assignments });
};

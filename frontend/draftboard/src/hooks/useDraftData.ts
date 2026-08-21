import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { BACKUP_DEPTH } from "../lib/draft.schemas";
import type { BackupPickRow, BudgetPickRow, DraftPickRow, PickSlot, SlotName } from "../lib/draft.schemas";

// Live projection of the Dexie tables into the shapes the draft components
// consume (the old machine-context "draftContext" fields). Rows are the
// storage model (server-shaped, one row per draft+player); these lists/maps
// are views. Re-renders automatically whenever a mutation touches the tables.

const EMPTY_BOARD_PICK = { name: "-", position: "", player_id: "", pick_id: "", projected_price: 0, price: 0 };
const EMPTY_BUDGET_PICK = { id: "", name: "", position: "", player_id: "", player_name: "", pick_id: "", projected_price: 0, price: 0, actual_price: 0, budget_position: "", status: "" };

export const useDraftData = (draftId: number) => {
    const meta = useLiveQuery(() => db.draft_meta.get(draftId), [draftId]);
    const pickRows = useLiveQuery(() => db.draft_picks.where("draftId").equals(draftId).toArray(), [draftId]);
    const budgetRows = useLiveQuery(() => db.budget_picks.where("draftId").equals(draftId).toArray(), [draftId]);
    const watchRows = useLiveQuery(() => db.watch_picks.where("draftId").equals(draftId).toArray(), [draftId]);
    // Local-only shelf of alternates (lib/db.ts v5) — never hydrated from, or
    // pushed to, the server.
    const backupRows = useLiveQuery(() => db.backup_picks.where("draftId").equals(draftId).toArray(), [draftId]);
    // Writes waiting for the server to come back (lib/writeQueue.ts).
    const pendingWrites = useLiveQuery(() => db.pending_writes.where("draftId").equals(draftId).count(), [draftId]) ?? 0;

    return useMemo(() => {
        if (!meta || !pickRows || !budgetRows || !watchRows || !backupRows) {
            return { hydrated: false, drafterId: 0, managers: [], undraftedPlayers: [], budgetedPlayers: {}, watchedPlayers: [], backupsBySlot: {}, budgetSpent: 0, pendingWrites };
        }

        const undraftedPlayers = pickRows
            .filter((row) => !row.drafted)
            .sort((a, b) => Number(b.projected_price) - Number(a.projected_price))
            .map((row) => ({ player: row.player, projected_price: row.projected_price, ...row.stats }));

        const draftedByManager: Record<number, DraftPickRow[]> = {};
        pickRows.forEach((row) => {
            if (row.drafted && row.manager_id != null) {
                (draftedByManager[row.manager_id] ??= []).push(row);
            }
        });

        const startingBudget = Number(meta.draftDetails.starting_budget) || 0;
        const managers = meta.managers.map((manager) => {
            const rows = draftedByManager[manager.manager_id] || [];
            const draft_picks: Record<SlotName, PickSlot> = {};
            meta.slots.forEach(({ slot, allowed_positions }) => {
                const row = rows.find((r) => r.slot === slot);
                draft_picks[slot] = {
                    position_slot: slot,
                    allowed_positions,
                    pick: row
                        ? { name: row.player.name, position: row.player.position, player_id: row.player_id, pick_id: row.pick_id, projected_price: row.player.projected_price, price: row.price }
                        : { ...EMPTY_BOARD_PICK },
                };
            });
            const spent = rows.reduce((acc, row) => acc + (Number(row.price) || 0), 0);
            return {
                ...manager,
                manager_budget: startingBudget - spent,
                draft_picks,
            };
        });

        const budgetBySlot: Record<SlotName, BudgetPickRow> = {};
        budgetRows.forEach((row) => { budgetBySlot[row.slot] = row; });
        const budgetedPlayers: Record<SlotName, PickSlot> = {};
        meta.slots.forEach(({ slot, order, allowed_positions }) => {
            const row = budgetBySlot[slot];
            budgetedPlayers[slot] = {
                order,
                allowed_positions,
                pick: row
                    ? { player_id: row.player_id, player_name: row.player_name, position: row.position, projected_price: row.projected_price, actual_price: row.actual_price, budget_position: slot, status: row.status }
                    : { ...EMPTY_BUDGET_PICK },
            };
        });

        const budgetSpent = budgetRows.reduce(
            (acc, row) => acc + (parseInt(String(row.actual_price)) || parseInt(String(row.projected_price)) || 0), 0);

        // One fixed-length shelf per BUDGET slot, indexed by rank-1 with holes
        // kept as null — the panel draws every cell, empty ones as drop targets.
        // Deliberately absent from budgetSpent: a backup is a candidate, not a
        // commitment.
        const backupsBySlot: Record<SlotName, (BackupPickRow | null)[]> = {};
        meta.slots.forEach(({ slot }) => {
            backupsBySlot[slot] = Array.from({ length: BACKUP_DEPTH }, () => null);
        });
        backupRows.forEach((row) => {
            // A row for a slot this draft doesn't have (or a rank past the
            // current depth) is ignored rather than crashing the projection.
            const shelf = backupsBySlot[row.slot];
            const index = Number(row.rank) - 1;
            if (shelf && index >= 0 && index < BACKUP_DEPTH) shelf[index] = row;
        });

        const watchedPlayers = [...watchRows].sort(
            (a, b) => Number(b.projected_price) - Number(a.projected_price));

        return {
            hydrated: true,
            drafterId: meta.managers.find((manager) => manager.is_drafter)?.manager_id ?? 0,
            managers,
            undraftedPlayers,
            budgetedPlayers,
            watchedPlayers,
            backupsBySlot,
            budgetSpent,
            pendingWrites,
        };
    }, [meta, pickRows, budgetRows, watchRows, backupRows, pendingWrites]);
};

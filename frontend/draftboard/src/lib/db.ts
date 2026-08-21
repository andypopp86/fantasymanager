import Dexie, { type Table } from "dexie";
import type { BackupPickRow, BudgetPickRow, DraftMetaRow, DraftPickRow, PendingWriteRow, WatchPickRow } from "./draft.schemas";

// Dexie is the client-side database. Server fetches hydrate these tables
// (hydrateDraft below), components read them live via useDraftData, and all
// writes go through lib/mutations.ts (one transaction + one API call each).
// The server remains the source of truth: a successful refetch replaces a
// draft's rows wholesale. If the server is unreachable, last session's rows
// are simply still here — offline viewing needs no special restore path.

// Schema history. Dexie applies version() blocks sequentially to upgrade
// whatever version a browser has — so APPEND a new version(n) for every
// change and never edit or remove an existing block.
//   v1: draftSnapshots (whole-context blob) keyed by draftId
//   v2: + savedAt index on draftSnapshots
//   v3: server-modeled tables (draft_picks/budget_picks/watch_picks/draft_meta);
//       draftSnapshots dropped — Dexie is now the data layer, not a crash dump
//   v4: pending_writes op log (offline write-queue, flushed by lib/writeQueue.ts)
//   v5: backup_picks — pre-picked alternates. LOCAL ONLY: no endpoint, no
//       write-queue entry, and hydrateDraft deliberately never touches them
//       (see the note there), so they live and die on this browser.
//   v6: backup_picks keyed per BUDGET slot — a shelf behind each budget slot
//       ([draftId+slot+rank]) instead of three slot-agnostic parking spots.
//       The upgrade CLEARS the table: v5 rows carried slot="BACKUP1..3", which
//       names no budget slot, so there is nothing to migrate them to.
class DraftboardDB extends Dexie {
    draft_picks!: Table<DraftPickRow, [number, number | string]>;
    budget_picks!: Table<BudgetPickRow, [number, number | string]>;
    watch_picks!: Table<WatchPickRow, [number, number | string]>;
    draft_meta!: Table<DraftMetaRow, number>;
    pending_writes!: Table<PendingWriteRow, number>;
    backup_picks!: Table<BackupPickRow, [number, number | string]>;

    constructor() {
        super("draftboard");
        this.version(1).stores({
            draftSnapshots: "draftId",
        });
        this.version(2).stores({
            draftSnapshots: "draftId, savedAt",
        });
        this.version(3).stores({
            draftSnapshots: null,
            draft_picks: "[draftId+player_id], draftId, [draftId+manager_id], [draftId+slot]",
            budget_picks: "[draftId+player_id], draftId, [draftId+slot]",
            watch_picks: "[draftId+player_id], draftId",
            draft_meta: "draftId",
        });
        this.version(4).stores({
            pending_writes: "++id, draftId",
        });
        this.version(5).stores({
            backup_picks: "[draftId+player_id], draftId, [draftId+slot]",
        });
        this.version(6).stores({
            backup_picks: "[draftId+player_id], draftId, [draftId+slot], [draftId+slot+rank]",
        }).upgrade((tx) => tx.table("backup_picks").clear());
    }
}

export const db = new DraftboardDB();

// Replace one draft's rows with fresh server data, atomically. Payloads are
// the four load-query responses (see Draft.tsx) passed through verbatim.
export const hydrateDraft = async (
    draftId: number,
    // The four load-query responses; typed loose because the data.ts wrapper
    // generics don't reflect the actual runtime arrays.
    payloads: {
        draftDetails: any,
        availablePlayers: any,
        managerPicks: any,
        budgetedPicks: any,
        watchedPlayers: any,
    },
) => {
    const { draftDetails, availablePlayers, managerPicks, budgetedPicks, watchedPlayers } = payloads;

    // backup_picks is NOT in anything below, on purpose: the backup slots are a
    // local-only shelf the server knows nothing about, so a refetch has no
    // opinion on them and wiping them would lose the whole feature every load.

    // Unsynced local writes exist: the server data is BEHIND our local rows,
    // so replacing them would silently undo queued changes. Skip — the next
    // refetch after the queue flushes will reconcile.
    const pendingCount = await db.pending_writes.where("draftId").equals(draftId).count();
    if (pendingCount > 0) return;

    const STAT_FIELDS = ["points", "yards", "tds", "first_downs", "rush_attempts", "receptions", "targets"];
    const pickRows: DraftPickRow[] = availablePlayers.map((item) => ({
        draftId,
        player_id: item.player.player_id,
        drafted: false,
        manager_id: null,
        price: null,
        slot: null,
        player: item.player,
        projected_price: item.projected_price,
        stats: Object.fromEntries(STAT_FIELDS.map((f) => [f, item[f]])),
    }));
    managerPicks.forEach((manager) => {
        Object.entries(manager.draft_picks || {}).forEach(([slot, pickSlot]: [string, any]) => {
            const pick = pickSlot.pick;
            if (!pick.player_id) return;
            pickRows.push({
                draftId,
                player_id: pick.player_id,
                drafted: true,
                manager_id: manager.manager_id,
                price: pick.price,
                slot,
                pick_id: pick.pick_id,
                player: { player_id: pick.player_id, name: pick.name, position: pick.position, projected_price: pick.projected_price },
                projected_price: pick.projected_price,
                stats: {},
            });
        });
    });

    const budgetRows: BudgetPickRow[] = Object.entries(budgetedPicks)
        .filter(([, slotObj]: [string, any]) => slotObj.pick.player_id !== "" && slotObj.pick.player_id != null)
        .map(([slot, slotObj]: [string, any]) => ({
            draftId,
            player_id: slotObj.pick.player_id,
            slot,
            player_name: slotObj.pick.player_name,
            position: slotObj.pick.position,
            projected_price: slotObj.pick.projected_price,
            actual_price: slotObj.pick.actual_price || 0,
            status: slotObj.pick.status,
        }));

    const watchRows: WatchPickRow[] = watchedPlayers.map((player) => ({
        draftId,
        player_id: player.player_id,
        name: player.name,
        position: player.position,
        projected_price: player.projected_price,
    }));

    const meta: DraftMetaRow = {
        draftId,
        savedAt: new Date().toISOString(),
        draftDetails,
        managers: managerPicks.map((manager) => ({
            manager_id: manager.manager_id,
            manager_name: manager.manager_name,
            manager_position: manager.manager_position,
            is_drafter: manager.is_drafter,
        })),
        slots: Object.entries(budgetedPicks).map(([slot, slotObj]: [string, any]) => ({
            slot,
            order: slotObj.order,
            allowed_positions: slotObj.allowed_positions,
        })),
    };

    await db.transaction("rw", db.draft_picks, db.budget_picks, db.watch_picks, db.draft_meta, async () => {
        await Promise.all([
            db.draft_picks.where("draftId").equals(draftId).delete(),
            db.budget_picks.where("draftId").equals(draftId).delete(),
            db.watch_picks.where("draftId").equals(draftId).delete(),
        ]);
        await Promise.all([
            db.draft_picks.bulkPut(pickRows),
            db.budget_picks.bulkPut(budgetRows),
            db.watch_picks.bulkPut(watchRows),
            db.draft_meta.put(meta),
        ]);
    });
};

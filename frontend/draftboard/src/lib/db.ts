import Dexie, { type Table } from "dexie";
import type { DraftContext } from "./draft.schemas";

// Local (IndexedDB) persistence of live draft state, so a mid-draft page
// reload or server outage doesn't lose the board. The server stays the source
// of truth whenever it's reachable — snapshots are a fallback, not a sync.

// One snapshot per draft: the entire machine context, written atomically so a
// restore is always a consistent instant (a player is available OR drafted,
// never both). Split into per-concept tables only when a real read/write
// pattern needs it (e.g. a future pendingWrites queue) — not for tidiness.
export type DraftSnapshot = {
    draftId: number;
    savedAt: string; // ISO timestamp, indexed for pruning
    context: DraftContext;
};

// Schema history. Dexie applies version() blocks sequentially to upgrade
// whatever version a browser has — so APPEND a new version(n) for every
// change and never edit or remove an existing block.
//   v1: draftSnapshots keyed by draftId
//   v2: + savedAt index (enables pruning stale snapshots)
class DraftboardDB extends Dexie {
    draftSnapshots!: Table<DraftSnapshot, number>;

    constructor() {
        super("draftboard");
        this.version(1).stores({
            draftSnapshots: "draftId",
        });
        this.version(2).stores({
            draftSnapshots: "draftId, savedAt",
        });
    }
}

export const db = new DraftboardDB();

// Snapshots fire on every state-machine transition (including drags), so
// coalesce bursts into one write.
const SAVE_DEBOUNCE_MS = 300;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const saveDraftSnapshot = (draftId: number, context: DraftContext) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        db.draftSnapshots
            .put({ draftId, savedAt: new Date().toISOString(), context })
            .catch((err) => console.error("Failed to save draft snapshot", err));
    }, SAVE_DEBOUNCE_MS);
};

export const loadDraftSnapshot = (draftId: number): Promise<DraftSnapshot | undefined> =>
    db.draftSnapshots.get(draftId);

export const deleteDraftSnapshot = (draftId: number): Promise<void> =>
    db.draftSnapshots.delete(draftId);

// Snapshots of long-finished drafts are dead weight (each can be hundreds of
// KB); drop any not written in this many days. Run once per app load.
const SNAPSHOT_TTL_DAYS = 45;

export const pruneStaleSnapshots = (): Promise<number> => {
    const cutoff = new Date(Date.now() - SNAPSHOT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return db.draftSnapshots.where("savedAt").below(cutoff).delete();
};

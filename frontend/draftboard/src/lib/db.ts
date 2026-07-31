import Dexie, { type Table } from "dexie";

// Local (IndexedDB) persistence of live draft state, so a mid-draft page
// reload or server outage doesn't lose the board. The server stays the source
// of truth whenever it's reachable — snapshots are a fallback, not a sync.

export type DraftSnapshot = {
    draftId: number;
    savedAt: string;
    // Serialized draftStateMachine context (plain data only).
    context: any;
};

class DraftboardDB extends Dexie {
    draftSnapshots!: Table<DraftSnapshot, number>;

    constructor() {
        super("draftboard");
        this.version(1).stores({
            draftSnapshots: "draftId",
        });
    }
}

export const db = new DraftboardDB();

// Snapshots fire on every state-machine transition (including drags), so
// coalesce bursts into one write.
const SAVE_DEBOUNCE_MS = 300;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const saveDraftSnapshot = (draftId: number, context: any) => {
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

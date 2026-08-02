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

// Offline write-queue. mutations.ts routes every API call through here:
// normally the call goes straight out, but when the server is unreachable
// (or older writes are already queued — ordering matters: an unbudget must
// land before the budget that replaces it) the op is appended to the
// pending_writes log and replayed FIFO once the server is back.
//
// Policy on replay: a NETWORK failure stops the flush (still offline, retry
// later); a SERVER response error drops the op — the server is the source of
// truth, and the next hydration reconciles local rows to whatever it says.

const OP_SENDERS: Record<string, (args: any) => Promise<any>> = {
    submit_pick: (a) => draftPickSubmit(a.draftId, a.managerId, a.playerId, { price: a.price, position_slot: a.slot }),
    unsubmit_pick: (a) => draftPickUnsubmit(a.draftId, a.managerId, a.playerId),
    budget_pick: (a) => draftBudgetPick(a.draftId, a.managerId, a.playerId, { projected_price: a.projectedPrice, budget_position: a.slot }),
    unbudget_pick: (a) => draftUnbudgetPick(a.draftId, a.managerId, a.playerId),
    watch: (a) => draftWatchPick(a.draftId, a.managerId, a.playerId, { watch: a.watch }),
    reslot_picks: (a) => draftReslotPicks(a.draftId, a.managerId, { assignments: a.assignments }),
    reslot_budget: (a) => draftReslotBudget(a.draftId, a.managerId, { assignments: a.assignments }),
    // Server-side cycle: each queued click replays as exactly one cycle step.
    favorite: (a) => favoritePlayer(a.draftId, a.playerId),
};

// Request never reached the server (offline, refused, timed out) — as opposed
// to the server answering with an error status.
export const isNetworkError = (err: any) =>
    !!err && (err.code === "ERR_NETWORK" || (!!err.request && !err.response));

const enqueue = (draftId: number, op: string, args: Record<string, any>) =>
    db.pending_writes.add({ draftId, op, args, createdAt: new Date().toISOString() });

const hasPending = async (draftId: number) =>
    (await db.pending_writes.where("draftId").equals(draftId).count()) > 0;

// Fire-and-forget path for the optimistic mutations: direct call when the
// coast is clear, queued when offline or behind other queued writes.
export const sendOrQueue = async (draftId: number, op: string, args: Record<string, any>) => {
    if (await hasPending(draftId)) {
        await enqueue(draftId, op, args);
        return;
    }
    try {
        await OP_SENDERS[op](args);
    } catch (err) {
        if (isNetworkError(err)) {
            await enqueue(draftId, op, args);
        } else {
            console.error(`${op} rejected by server`, err);
        }
    }
};

// Response-needed path (submit_pick, favorite): returns the server response,
// or null after queueing when the server can't be reached — the caller treats
// "queued" as optimistically accepted.
export const sendOrQueueWithResponse = async (
    draftId: number,
    op: string,
    args: Record<string, any>,
): Promise<{ response: any } | { queued: true }> => {
    if (await hasPending(draftId)) {
        await enqueue(draftId, op, args);
        return { queued: true };
    }
    try {
        return { response: await OP_SENDERS[op](args) };
    } catch (err) {
        if (isNetworkError(err)) {
            await enqueue(draftId, op, args);
            return { queued: true };
        }
        throw err;
    }
};

let flushing = false;

export const flushPendingWrites = async () => {
    if (flushing) return;
    flushing = true;
    try {
        const rows = await db.pending_writes.orderBy("id").toArray();
        for (const row of rows) {
            try {
                await OP_SENDERS[row.op](row.args);
            } catch (err) {
                if (isNetworkError(err)) return; // still offline — retry on the next trigger
                console.error("Dropping queued write rejected by server", row, err);
            }
            await db.pending_writes.delete(row.id!);
        }
    } finally {
        flushing = false;
    }
};

// Flush triggers: connectivity returning, a steady heartbeat while anything
// is queued, and app load (importing this module).
const FLUSH_INTERVAL_MS = 10_000;
if (typeof window !== "undefined") {
    window.addEventListener("online", () => { flushPendingWrites(); });
    setInterval(() => {
        db.pending_writes.count().then((count) => { if (count) flushPendingWrites(); });
    }, FLUSH_INTERVAL_MS);
    flushPendingWrites();
}

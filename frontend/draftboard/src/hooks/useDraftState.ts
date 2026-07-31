import { createActor } from "xstate";
import { draftStateMachine } from "../state_machines/draftStateMachine";
import { useSelector } from '@xstate/react';
import { saveDraftSnapshot } from "../lib/db";

// One app-wide actor (not per-component) so draft state — including transient
// bits like the current nomination — survives SPA navigation between pages.
// draft_loaded reconciles fresh server data into it on every return visit.
const draftActor = createActor(draftStateMachine).start();

// Persist every context change to Dexie so a reload or server outage can pick
// up where the draft left off. Saved without the restored-flags so a
// snapshot-of-a-restored-session hydrates the same as any other snapshot.
draftActor.subscribe((state) => {
    const context = state.context;
    if (!context.draftId) return;
    saveDraftSnapshot(context.draftId, {
        ...context,
        restoredFromSnapshot: false,
        snapshotSavedAt: null,
    });
});

export const useDraftState = () => {
    const {currentState, draftContext} = useSelector(draftActor, (state) => {
        return {
            currentState: state.value,
            draftContext: state.context,

        }
    });
    return {
        currentState,
        draftStateRef: draftActor,
        draftContext
    };
}

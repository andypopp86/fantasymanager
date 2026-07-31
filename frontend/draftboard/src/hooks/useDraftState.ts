import { useEffect } from "react";
import { draftStateMachine } from "../state_machines/draftStateMachine";
import { useActorRef, useSelector } from '@xstate/react';
import { saveDraftSnapshot } from "../lib/db";

export const useDraftState = () => {
    const draftStateRef = useActorRef(draftStateMachine);
    const {currentState, draftContext} = useSelector(draftStateRef, (state) => {
        return {
            currentState: state.value,
            draftContext: state.context,

        }
    });

    // Persist every context change to Dexie so a reload or server outage can
    // pick up where the draft left off. Saved without the restored-flags so a
    // snapshot-of-a-restored-session hydrates the same as any other snapshot.
    useEffect(() => {
        const subscription = draftStateRef.subscribe((state) => {
            const context = state.context;
            if (!context.draftId) return;
            saveDraftSnapshot(context.draftId, {
                ...context,
                restoredFromSnapshot: false,
                snapshotSavedAt: null,
            });
        });
        return () => subscription.unsubscribe();
    }, [draftStateRef]);

    return {
        currentState,
        draftStateRef,
        draftContext
    };
}

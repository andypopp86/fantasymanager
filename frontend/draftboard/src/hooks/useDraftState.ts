import { createActor } from "xstate";
import { draftStateMachine } from "../state_machines/draftStateMachine";
import { useSelector } from '@xstate/react';

// One app-wide actor (not per-component) so flow state — the current
// nomination, drag — survives SPA navigation between pages. Draft DATA lives
// in Dexie and is read via useDraftData; this machine is interaction-only.
const draftActor = createActor(draftStateMachine).start();

export const useDraftState = () => {
    const {currentState, flowContext} = useSelector(draftActor, (state) => {
        return {
            currentState: state.value,
            flowContext: state.context,
        }
    });
    return {
        currentState,
        draftStateRef: draftActor,
        flowContext,
    };
}

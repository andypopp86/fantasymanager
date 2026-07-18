import { draftStateMachine } from "../state_machines/draftStateMachine";
import { useActorRef, useSelector } from '@xstate/react';

export const useDraftState = () => {
    const draftStateRef = useActorRef(draftStateMachine);
    const {currentState, draftContext} = useSelector(draftStateRef, (state) => { 
        return {
            currentState: state.value,
            draftContext: state.context,

        } 
    });
    return {
        currentState,
        draftStateRef,
        draftContext
    };
}
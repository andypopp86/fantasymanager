import { appStateMachine } from '../state_machines/appStateMachine';
import { useActorRef, useSelector } from '@xstate/react';

export const useDraftAppState = () => {
    const draftAppRef = useActorRef(appStateMachine);
    const {currentState, selectedDraft} = useSelector(draftAppRef, (state) => {
        return {
            currentState: state.value,
            selectedDraft: state.context.draft
        } });

    return {
        currentState,
        draftAppRef,
        selectedDraft
    };
}
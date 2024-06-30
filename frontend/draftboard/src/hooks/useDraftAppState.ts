import { appStateMachine } from '../state_machines/appStateMachine';
import { useActor, useSelector } from '@xstate/react';

export const useDraftAppState = () => {
    const [, contextSend, draftAppRef] = useActor(appStateMachine);
    const {currentState, selectedDraftId} = useSelector(draftAppRef, (state) => { return {currentState: state.value, selectedDraftId: state.context.draftId} });
    return {
        currentState,
        draftAppRef,
        contextSend,
        selectedDraftId
    };
}
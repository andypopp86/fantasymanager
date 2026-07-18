import { appStateMachine } from '../state_machines/appStateMachine';
import { useActorRef, useSelector } from '@xstate/react';

export const useDraftAppState = () => {
    const draftAppRef = useActorRef(appStateMachine);
    const {currentState, selectedDraft, appContext } = useSelector(draftAppRef, (state) => {
        return {
            currentState: state.value,
            selectedDraft: state.context.draft,
            appContext: state.context,
        } });

    return {
        currentState,
        draftAppRef,
        selectedDraft,
        appContext,
    };
}
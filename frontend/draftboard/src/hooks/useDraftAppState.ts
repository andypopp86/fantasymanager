import { appStateMachine } from '../state_machines/appStateMachine';
import { Draft } from '../lib/draft.schemas';
import { useActor, useSelector } from '@xstate/react';
import { useEffect, useState } from 'react';

export const useDraftAppState = () => {
    const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
    const [, contextSend, draftAppRef] = useActor(appStateMachine);
    const currentState = useSelector(draftAppRef, (state) => state.value);
    return {
        selectedDraft,
        setSelectedDraft,
        currentState,
        draftAppRef,
        contextSend,
    };
}
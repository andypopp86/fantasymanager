import { setup, assign } from 'xstate';

export interface appContext {
    draftId: string
}

export const appStateMachine = setup({
    types: {
        context: {} as appContext,
    },
    actions: {
        selectDraft: assign((context, params) => {
            return { draftId: "1234" }
        })
    },
}).createMachine({
    id: 'app',
    context: ({ input }) => ({ 
        draftId: "",
        }),
    initial: 'selectingDraft',
    states: {
        selectingDraft: {
            on: {
                DRAFT_SELECTED: {
                    actions: ['selectDraft'],
                }
            }
        },
    }
});
export default appStateMachine;
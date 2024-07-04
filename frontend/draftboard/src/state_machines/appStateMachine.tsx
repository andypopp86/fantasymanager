import { createMachine, assign, createActor } from 'xstate';

const selectPlayer = (context, event) => {
    return
}
export const appStateMachine = createMachine({
  context: {
    draftId: '',
  },
  initial: 'selecting',
  states: {
    selecting: {
        on: {
            'draft.selected': {
                actions: assign({ draftId: (context, event) => context.event.draft_id }), 
                target: 'drafting' 
            },
        },
    },
    drafting: {
        on: {
            "draft.back": "selecting",
            'draft.player': {
                actions: (context, event) => selectPlayer(context, event),
            },
        },
    },
  },
});


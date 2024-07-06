import { createMachine, assign } from 'xstate';


export const appStateMachine = createMachine({
  context: {
    draft: '',
  },
  initial: 'selecting',
  states: {
    selecting: {
        on: {
            'draft.selected': {
                actions: assign({ draft: ({context, event}) => event.draft }), 
                target: 'drafting' 
            },
        },
    },
    drafting: {
        on: {
            "draft.back": "selecting",
        },
    },
  },
});


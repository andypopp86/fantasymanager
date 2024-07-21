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
            'go_to_create_draft': 'creating',
        },
    },
    creating: {
        on: {
            'draft.create': {
                actions: assign({ draft: ({context, event}) => event.draft }), 
                target: 'selecting' 
            },
            'draft.back': 'selecting',
        },
    },
    drafting: {
        on: {
            "draft.back": "selecting",
        },
    },
  },
});


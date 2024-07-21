import { createMachine, assign } from 'xstate';


export const appStateMachine = createMachine({
  context: {
    draft: '',
    draft_list: [],
  },
  initial: 'loading',
  states: {
    loading: {
        on: {
            'drafts.loaded': {
                actions: assign({ draft_list: ({context, event}) => event.draft_list }), 
                target: 'selecting'
            },
        }
    },
    selecting: {
        on: {
            'draft.selected': {
                actions: assign({ draft: ({context, event}) => event.draft }), 
                target: 'drafting' 
            },
            'go_to_create_draft': 'creating',
            'draft.deleted': {
                actions: assign({ draft_list: ({context, event}) => context.draft_list.filter((draft) => 
                    draft.id !== event.draft_id) }),
                target: 'selecting',
            
            },
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


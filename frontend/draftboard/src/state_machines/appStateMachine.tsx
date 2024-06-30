import { createMachine, assign, createActor } from 'xstate';

const selectPlayer = () => {
    console.log('Hello');
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
            actions: assign({ draftId: (context, event) => {console.log(context);console.log(event); return context.event.draft_id} }), 
            target: 'drafting' 
        },
      },
    },
    drafting: {
      on: {
        'draft.player': {
            actions: selectPlayer,
            
        //   actions: assign({
        //     draftId: ({ context }) => context.draftId,
        //   }),
          target: 'selecting',
        },
      },
    },
  },
});

// export const draftAppActor = createActor(appStateMachine).start();

// draftAppActor.subscribe((state) => {
//   console.log(state.context);
// });

// draftAppActor.send({ type: 'draft.selected' });
// draftAppActor.send({ type: 'draft.player' });


import { createMachine, assign, createActor } from 'xstate';


export const draftStateMachine = createMachine({
  context: {
    draftId: 0 as number,
    nominatedPlayer: {} as any,
    managers: [] as any[],
    undraftedPlayers: [] as any[],
    draftedPlayers: [] as any[],
    watchedPlayers: [] as any[],
  },
  initial: 'loadingDraft',
  states: {
    loadingDraft: {
        on: {
            'draft_loaded': {
                actions: assign({
                    draftId: ({ event }) => event.draftId,
                    managers: ({ event }) => event.managers,
                    undraftedPlayers: ({ event }) => event.undraftedPlayers,
                }),
                target: 'waiting',
            },
        },
    },
    waiting: {
        on: {
            'nominate_player': {
                actions: assign({
                    nominatedPlayer: ({ event }) => event.player,
                }),
                target: 'player_nominated',
            },
        },
    },
    player_nominated: {
        on: {
            'draft_player': {
                actions: assign({
                    draftedPlayers: ({ context, event }) => [...context.draftedPlayers, event.player],
                    undraftedPlayers: ({ context, event }) => context.undraftedPlayers.filter((player) => player.id !== event.player.id),
                    managers: ({ context, event }) => reduceManagersBudget(context.managers, event),
                }),
                target: 'waiting',
            },
            'watch_player': {
                actions: assign({
                    watchedPlayers: ({ event }) => [...watchedPlayers, event.player],
                }),
                target: 'waiting',
            },

        },
    },
    },
});


const reduceManagersBudget = (managers: any[], event: any) => {
    const updatedManagers = managers.map((manager) => {
        if (manager.manager_id === event.manager_id) {
            return {
                ...manager,
                manager_budget: manager.manager_budget - event.price,
            };
        }
        return manager;
    });
    return updatedManagers;
}
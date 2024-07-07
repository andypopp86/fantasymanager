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
            'undraft_player': {
                actions: assign({
                    draftedPlayers: ({ context, event }) => context.draftedPlayers.filter((player) => player.id !== event.pick.player_id),
                    undraftedPlayers: ({ context, event }) => [recreatePlayer(event.pick), ...context.undraftedPlayers],
                    managers: ({ context, event }) => updateManagers(context.managers, event.managerId, event.pick, "undraft"),
                }),
                target: 'waiting',
            },
        },
    },
    player_nominated: {
        on: {
            'draft_player': {
                actions: assign({
                    draftedPlayers: ({ context, event }) => [...context.draftedPlayers, event.player],
                    undraftedPlayers: ({ context, event }) => context.undraftedPlayers.filter((player) => player.id !== event.player.id),
                    managers: ({ context, event }) => updateManagers(context.managers, event.managerId, event.player, "draft"),
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


const updateManagers = (managers: any[], manager_id: number, pick: any, action: string) => {
    const price = action === "draft" ? pick.price : -pick.price;
    return managers.map((manager) => {
        if (manager.manager_id === manager_id) {
            const managerWithUpdatedPrice = {
                ...manager,
                manager_budget: manager.manager_budget - price,
            };
            if (action === "draft") {
                const managerWithPickAdded = {
                    ...managerWithUpdatedPrice,
                    draft_picks: [...manager.draft_picks, pick],
                };
                return managerWithPickAdded;
            } else if (action === "undraft") {
                const managerWithPickRemoved ={
                    ...managerWithUpdatedPrice,
                    draft_picks: manager.draft_picks.filter((existing_pick) => existing_pick.player_id !== pick.player_id),
                };
                return managerWithPickRemoved;
            }
        }
        return manager;
    });
}

const recreatePlayer = (pick: any) => {
    const recreatedPlayer = {
        drafted: false,
        id: pick.pick_id,
        last_update_time: "",
        manager: null,
        player: {
            id: pick.player_id,
            name: pick.name,
            position: pick.position,
            projected_price: pick.projected_price,
        },
        price: null,
    }
    return recreatedPlayer;
}
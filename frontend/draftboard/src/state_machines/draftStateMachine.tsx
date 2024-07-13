import { createMachine, assign, createActor } from 'xstate';


export const draftStateMachine = createMachine({
  context: {
    draftId: 0 as number,
    drafterId: 0 as number,
    nominatedPlayer: {} as any,
    managers: [] as any[],
    undraftedPlayers: [] as any[],
    draftedPlayers: [] as any[],
    watchedPlayers: [] as any[],
    budgetedPlayers : [] as any[],
    draggedPlayer: {} as any,
    budgetSlotTargeted: {} as any,
    budgetSpent: 0 as number,
  },
  initial: 'loadingDraft',
  states: {
    loadingDraft: {
        on: {
            'draft_loaded': {
                actions: assign({
                    draftId: ({ event }) => event.draftId,
                    drafterId: ({ event }) => event.managers.find((manager) => manager.is_drafter).manager_id,
                    managers: ({ event }) => event.managers,
                    undraftedPlayers: ({ event }) => event.undraftedPlayers,
                    budgetedPlayers: ({ event }) => event.budgetedPicks,
                    budgetSpent: ({ event }) => calculateBudgetSpent(event.budgetedPicks)
                    // TODO: implement draftedPlayers (low priority)
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
                    // draftedPlayers: ({ context, event }) => context.draftedPlayers.filter((player) => player.id !== event.pick.player_id),
                    undraftedPlayers: ({ context, event }) => [recreatePlayer(event.pick), ...context.undraftedPlayers],
                    managers: ({ context, event }) => updateManagers(context.managers, event.managerId, event.pick, "undraft"),
                }),
                target: 'waiting',
            },
            'unwatch_player': {
                actions: assign({
                    watchedPlayers: ({ context, event }) => context.watchedPlayers.filter((player) => player.id !== event.player.id),
                }),
                target: 'waiting',
            },
            'drag_player': {
                actions: assign({
                    draggedPlayer: ({ event }) => event.player,
                }),
                target: 'waiting',
            },
            'budget_player': {
                actions: assign({
                    budgetedPlayers: ({ context, event }) => updateBudgetedPlayers(context, event),
                    budgetSpent: ({ context, event }) => context.budgetSpent + parseInt(event.budgetPlayerToSend.projected_price)
                }),
                target: 'waiting',
            },
            'budget_slot_targeted':  {
                actions: assign({
                    budgetSlotTargeted: ({ event }) => event.positionSlot,
                }),
                target: 'waiting',
            },
            'unbudget_player': {
                actions: assign({
                    budgetSpent: ({ context, event }) => context.budgetSpent - parseInt(context.budgetedPlayers[event.positionSlot]["projected_price"]),
                    budgetedPlayers: ({ context, event }) => {
                        context.budgetedPlayers[event.positionSlot]["id"] = null;
                        context.budgetedPlayers[event.positionSlot]["player_id"] = null;
                        context.budgetedPlayers[event.positionSlot]["player_name"] = null;
                        context.budgetedPlayers[event.positionSlot]["projected_price"] = 0;
                        return context.budgetedPlayers;
                    },
                }),
                target: 'waiting',
            },
        },
    },
    player_nominated: {
        on: {
            'draft_player': {
                actions: assign({
                    // draftedPlayers: ({ context, event }) => [...context.draftedPlayers, event.player],
                    undraftedPlayers: ({ context, event }) => context.undraftedPlayers.filter((uplayer) => uplayer.player.id !== event.pick.player_id),
                    managers: ({ context, event }) => updateManagers(context.managers, event.managerId, event.pick, "draft"),
                    budgetSpent: ({ context, event }) => recalculteBudgetIfNecessary(context, event),
                }),
                target: 'waiting',
            },
            'watch_player': {
                actions: assign({
                    watchedPlayers: ({ context, event }) => [...context.watchedPlayers, event.player],
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
                let slotFound = false;
                const managerWithPickAdded = {
                    ...managerWithUpdatedPrice,
                    draft_picks: manager.draft_picks.map((existing_pick) => {
                        if (existing_pick.player_id === '' && !slotFound) {
                            slotFound = true;
                            return pick;
                        }
                        return existing_pick;
                    }),
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

const updateBudgetedPlayers = (context: any, event: any) => {
    context.budgetedPlayers[event.positionSlot]["id"] = event.budgetPlayerToSend.id;
    context.budgetedPlayers[event.positionSlot]["player_id"] = event.budgetPlayerToSend.player_id;
    context.budgetedPlayers[event.positionSlot]["player_name"] = event.budgetPlayerToSend.player_name;
    context.budgetedPlayers[event.positionSlot]["projected_price"] = event.budgetPlayerToSend.projected_price;
    return context.budgetedPlayers;
}

const calculateBudgetSpent = (budgetedPicks) => {
    let budgetSpent = 0;
    Object.entries(budgetedPicks).forEach(([positionSlot, pick]) => {
        budgetSpent += parseInt(pick.projected_price);
    });
    return budgetSpent
}

const findBudgetedPositionSlotByPlayerId = (context, playerId) => {
    let positionSlot = null;
    Object.entries(context.budgetedPlayers).forEach(([slot, pick]) => {
        if (pick.player_id === playerId) {
            positionSlot = slot;
        }
    });
    return positionSlot;
}

const clearBudgetedPositionSlot = (context, positionSlot) => {
    context.budgetedPlayers[positionSlot]["id"] = null;
    context.budgetedPlayers[positionSlot]["player_id"] = null;
    context.budgetedPlayers[positionSlot]["player_name"] = null;
    context.budgetedPlayers[positionSlot]["projected_price"] = 0;
    return context.budgetedPlayers;
}

const recalculteBudgetIfNecessary = (context, event) => {
    const budgetedPositionSlot = findBudgetedPositionSlotByPlayerId(context, event.pick.player_id);
    if (budgetedPositionSlot) {
        context.budgetedPlayers = clearBudgetedPositionSlot(context, budgetedPositionSlot);
        context.budgetSpent = calculateBudgetSpent(context.budgetedPlayers);
    }
    return context.budgetSpent;
}
import { createMachine, assign } from 'xstate';
import { findBudgetedPositionSlotByPlayerId, checkForPositionLimitHit } from '../utils/draftHelpers';


export const draftStateMachine = createMachine({
  context: {
    draftId: 0 as number,
    drafterId: 0 as number,
    draftDetails: {} as any,
    nominatedPlayer: {} as any,
    nominationPrice: 0 as number,
    managers: [] as any[],
    undraftedPlayers: [] as any[],
    draftedPlayers: [] as any[],
    watchedPlayers: [] as any[],
    budgetedPlayers : [] as any[],
    draggedPlayer: {} as any,
    budgetSlotTargeted: {} as any,
    budgetSpent: 0 as number,
    planChanges: [] as any[],
  },
  initial: 'loadingDraft',
  states: {
    loadingDraft: {
        on: {
            'draft_loaded': {
                actions: assign({
                    draftId: ({ event }) => event.draftDetails.id,
                    draftDetails: ({ event }) => event.draftDetails,
                    drafterId: ({ event }) => event.managers.find((manager) => manager.is_drafter).manager_id,
                    managers: ({ event }) => event.managers,
                    undraftedPlayers: ({ event }) => event.undraftedPlayers,
                    watchedPlayers: ({ event }) => event.watchedPlayers,
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
                    nominationPrice: ({ event }) => Math.round(parseFloat(event.player.projected_price)) || 1,
                }),
                target: 'player_nominated',
            },
            'undraft_player': {
                actions: assign({
                    // draftedPlayers: ({ context, event }) => context.draftedPlayers.filter((player) => player.id !== event.pick.player_id),
                    // budgetedPlayers: ({ context, event }) => updateBudgetedPlayers(context, event.positionSlot, event.player_id, event.player_name, event.pickSlot.pick.projected_price),
                    budgetSpent: ({ context, event }) => calculateBudgetSpent(context.budgetedPlayers),
                    undraftedPlayers: ({ context, event }) => [recreatePlayer(event.pickSlot.pick), ...context.undraftedPlayers],
                    managers: ({ context, event }) => updateManagers(context.draftDetails, context.managers, event.managerId, event.pickSlot, "undraft"),
                }),
                target: 'waiting',
            },
            'unwatch_player': {
                actions: assign({
                    watchedPlayers: ({ context, event }) => context.watchedPlayers.filter((watchedPlayer) => {
                        return watchedPlayer.player_id !== event.player.player_id}),
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
                    budgetedPlayers: ({ context, event }) => updateBudgetedPlayers(context, event.positionSlot, event.player_id, event.player_name, event.price),
                    budgetSpent: ({ context, event }) => calculateBudgetSpent(context.budgetedPlayers),
                }),
                target: 'waiting',
            },
            'budget_slot_targeted':  {
                actions: assign({
                    budgetSlotTargeted: ({ event }) => event.positionSlot,
                }),
                target: 'waiting',
            },
            'reslot_manager': {
                actions: assign({
                    managers: ({ context, event }) => reslotManagerPicks(context.managers, event.managerId, event.assignments),
                }),
                target: 'waiting',
            },
            'reslot_budget': {
                actions: assign({
                    budgetedPlayers: ({ context, event }) => reslotBudgetedPlayers(context.budgetedPlayers, event.assignments),
                }),
                target: 'waiting',
            },
            'unbudget_player': {
                actions: assign({
                    budgetedPlayers: ({ context, event }) => {
                        context.budgetedPlayers[event.positionSlot]["pick"]["id"] = null;
                        context.budgetedPlayers[event.positionSlot]["pick"]["player_id"] = null;
                        context.budgetedPlayers[event.positionSlot]["pick"]["player_name"] = null;
                        context.budgetedPlayers[event.positionSlot]["pick"]["projected_price"] = 0;
                        context.budgetedPlayers[event.positionSlot]["pick"]["actual_price"] = 0;
                        return context.budgetedPlayers;
                    },
                    budgetSpent: ({ context, event }) => calculateBudgetSpent(context.budgetedPlayers),
                }),
                target: 'waiting',
            },
        },
    },
    player_nominated: {
        on: {
            'set_nomination_price': {
                actions: assign({
                    nominationPrice: ({ event }) => event.price,
                }),
            },
            'draft_player': {
                actions: assign({
                    // draftedPlayers: ({ context, event }) => [...context.draftedPlayers, event.player],
                    undraftedPlayers: ({ context, event }) => context.undraftedPlayers.filter((uplayer) => uplayer.player.player_id !== event.pickSlot.pick.player_id),
                    watchedPlayers: ({ context, event }) => context.watchedPlayers.filter((watchedPlayer) => watchedPlayer.player_id !== event.pickSlot.pick.player_id),
                    managers: ({ context, event }) => updateManagers(context.draftDetails, context.managers, event.managerId, event.pickSlot, "draft"),
                    budgetSpent: ({ context, event }) => calculateBudgetSpent(context.budgetedPlayers),
                    nominatedPlayer: () => ({}),
                    nominationPrice: () => 0,
                }),
                target: 'waiting',
            },
            'watch_player': {
                actions: assign({
                    watchedPlayers: ({ context, event }) => {
                        const newWatchList = [...context.watchedPlayers, event.player];
                        const priceDescWatchList = newWatchList.sort((a, b) => b.projected_price - a.projected_price);
                        return priceDescWatchList;
                    }
                }),
                target: 'waiting',
            },
            'cancel_nomination': {
                actions: assign({
                    nominatedPlayer: () => ({}),
                    nominationPrice: () => 0,
                }),
                target: 'waiting',
            },
            'reslot_manager': {
                actions: assign({
                    managers: ({ context, event }) => reslotManagerPicks(context.managers, event.managerId, event.assignments),
                }),
            },
            'reslot_budget': {
                actions: assign({
                    budgetedPlayers: ({ context, event }) => reslotBudgetedPlayers(context.budgetedPlayers, event.assignments),
                }),
            },
            'budget_player': {
                actions: assign({
                    budgetedPlayers: ({ context, event }) => updateBudgetedPlayers(context, event.positionSlot, event.player_id, event.player_name, event.price),
                    budgetSpent: ({ context, event }) => calculateBudgetSpent(context.budgetedPlayers),
                }),
            },
            'unbudget_player': {
                actions: assign({
                    budgetedPlayers: ({ context, event }) => {
                        context.budgetedPlayers[event.positionSlot]["pick"]["id"] = null;
                        context.budgetedPlayers[event.positionSlot]["pick"]["player_id"] = null;
                        context.budgetedPlayers[event.positionSlot]["pick"]["player_name"] = null;
                        context.budgetedPlayers[event.positionSlot]["pick"]["projected_price"] = 0;
                        context.budgetedPlayers[event.positionSlot]["pick"]["actual_price"] = 0;
                        return context.budgetedPlayers;
                    },
                    budgetSpent: ({ context, event }) => calculateBudgetSpent(context.budgetedPlayers),
                }),
            },

        },
    },
    },
});


const updateManagers = (draftDetails: any, managers: any[], manager_id: number, pickSlot: any, action: string) => {
    const price = action === "draft" ? pickSlot.pick.price : -pickSlot.pick.price;
    const updatedManagers = managers.map((manager) => {
        if (manager.manager_id === manager_id) {
            const managerWithUpdatedPrice = {
                ...manager,
                manager_budget: manager.manager_budget - price,
            };
            if (action === "draft") {
                const draftedSlot = pickSlot.pick.slot;


                const managerWithPickUpdated = {
                    ...managerWithUpdatedPrice,
                    draft_picks: Object.keys(manager.draft_picks).reduce((result, existingSlot) => {
                        const existing_pick = manager.draft_picks[existingSlot];
                        const slotFound = existingSlot === draftedSlot;
                        if (slotFound) {
                            result[existingSlot] = {
                                ...existing_pick,
                                "pick": {
                                    name: pickSlot.pick.name,
                                    price: pickSlot.pick.price,
                                    position: pickSlot.pick.position,
                                    player_id: pickSlot.pick.player_id,
                                    pick_id: pickSlot.pick.pick_id,
                                    projected_price: pickSlot.pick.projected_price
                                }
                            };
                        } else {
                            result[existingSlot] = {
                                ...existing_pick,
                                "pick": existing_pick.pick
                            };
                        }
                        return result;
                    }, {}),
                };
                return managerWithPickUpdated;
            } else if (action === "undraft") {
                const managerWithPickRemoved = {
                    ...managerWithUpdatedPrice,
                    draft_picks: Object.keys(manager.draft_picks).reduce((result, slot) => {
                        const existing_pick = manager.draft_picks[slot];
                        if (slot == pickSlot.position_slot) {
                            result[slot] = {
                                ...existing_pick,
                                "pick": {
                                    name: '-',
                                    price: 0,
                                    position: '',
                                    player_id: '',
                                    pick_id: '',
                                    projected_price: 0,
                                    actual_price: 0,
                                }
                            };
                        } else {
                            result[slot] = {...existing_pick}
                        }
                        return result;
                    }, {}),
                };
                return managerWithPickRemoved;
            }
        }
        return manager;
    });
    checkForPositionLimitHit(updatedManagers, draftDetails, pickSlot.pick.position, manager_id);
    return updatedManagers;
}

const EMPTY_DRAFT_PICK = { name: '-', price: 0, position: '', player_id: '', pick_id: '', projected_price: 0, actual_price: 0 };
const EMPTY_BUDGET_PICK = { name: '', position: '', player_id: '', player_name: '', pick_id: '', projected_price: 0, price: 0, actual_price: 0, budget_position: '', status: '' };

// Rewrite one manager's draft_picks so each player lands in its assigned slot.
// Slots keep their canonical order (the source object is already QB1..BENCH7).
const reslotManagerPicks = (managers: any[], managerId: number, assignments: Record<string, number>) => {
    return managers.map((manager) => {
        if (manager.manager_id !== managerId) return manager;
        const pickByPlayer: Record<string, any> = {};
        Object.values(manager.draft_picks).forEach((slot: any) => {
            if (slot.pick && slot.pick.player_id) pickByPlayer[slot.pick.player_id] = slot.pick;
        });
        const newDraftPicks: Record<string, any> = {};
        Object.keys(manager.draft_picks).forEach((slotName) => {
            const template = manager.draft_picks[slotName];
            const assignedPlayerId = assignments[slotName];
            const movedPick = assignedPlayerId != null ? pickByPlayer[assignedPlayerId] : undefined;
            newDraftPicks[slotName] = movedPick
                ? { ...template, pick: { ...movedPick, slot: slotName } }
                : { ...template, pick: { ...EMPTY_DRAFT_PICK } };
        });
        return { ...manager, draft_picks: newDraftPicks };
    });
};

// Rewrite the budgeted roster so each player lands in its assigned slot.
const reslotBudgetedPlayers = (budgetedPlayers: any, assignments: Record<string, number>) => {
    const pickByPlayer: Record<string, any> = {};
    Object.values(budgetedPlayers).forEach((slot: any) => {
        if (slot.pick && slot.pick.player_id) pickByPlayer[slot.pick.player_id] = slot.pick;
    });
    const newBudgeted: Record<string, any> = {};
    Object.keys(budgetedPlayers).forEach((slotName) => {
        const template = budgetedPlayers[slotName];
        const assignedPlayerId = assignments[slotName];
        const movedPick = assignedPlayerId != null ? pickByPlayer[assignedPlayerId] : undefined;
        newBudgeted[slotName] = movedPick
            ? { ...template, pick: { ...movedPick, budget_position: slotName } }
            : { ...template, pick: { ...EMPTY_BUDGET_PICK } };
    });
    return newBudgeted;
};

const recreatePlayer = (pick: any) => {
    const recreatedPlayer = {
        drafted: false,
        id: pick.pick_id,
        last_update_time: "",
        manager: null,
        player: {
            id: pick.player_id,
            player_id: pick.player_id,
            name: pick.name,
            position: pick.position,
            projected_price: pick.projected_price,
        },
        projected_price: pick.projected_price,
        price: null,
    }
    return recreatedPlayer;
}

const updateBudgetedPlayers = (context: any, positionSlot: string, player_id: number, player_name: string, price: number) => {
    let updatedBudgetedPlayers = Object.assign({}, context.budgetedPlayers);
    updatedBudgetedPlayers[positionSlot]["pick"]["player_id"] = player_id;
    updatedBudgetedPlayers[positionSlot]["pick"]["player_name"] = player_name;
    updatedBudgetedPlayers[positionSlot]["pick"]["projected_price"] = price;
    return updatedBudgetedPlayers;
}

const calculateBudgetSpent = (budgetedPicks) => {
    let budgetSpent = 0;
    Object.entries(budgetedPicks).forEach(([positionSlot, pickSlot]) => {
        const actualOrProjected = pickSlot.pick.actual_price || pickSlot.pick.projected_price;
        budgetSpent += parseFloat(actualOrProjected);
    });
    return budgetSpent
}


const clearBudgetedPositionSlot = (context, positionSlot) => {
    context.budgetedPlayers[positionSlot]["pick"]["id"] = null;
    context.budgetedPlayers[positionSlot]["pick"]["player_id"] = null;
    context.budgetedPlayers[positionSlot]["pick"]["player_name"] = null;
    context.budgetedPlayers[positionSlot]["pick"]["projected_price"] = 0;
    return context.budgetedPlayers;
}


// this should probably be broken up into budget $$ and budget players functions
const recalculateBudgetIfNecessary = (context, event) => {
    if (event.managerId === context.drafterId) {
        return context.budgetSpent;
    }
    const budgetedPositionSlot = findBudgetedPositionSlotByPlayerId(context.budgetedPlayers, event.pick.player_id);
    if (!budgetedPositionSlot) {
        return context.budgetSpent;
    }
    if (budgetedPositionSlot) {
        context.budgetedPlayers = clearBudgetedPositionSlot(context, budgetedPositionSlot);
        context.budgetSpent = calculateBudgetSpent(context.budgetedPlayers);
    }
    return context.budgetSpent;
}
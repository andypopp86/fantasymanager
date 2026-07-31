export const findBudgetedPositionSlotByPlayerId = (budgetedPlayers, playerId) => {
    let positionSlot = null;
    Object.entries(budgetedPlayers).forEach(([slot, pickSlot]) => {
        if (pickSlot.pick.player_id === playerId) {
            positionSlot = slot;
        }
    });
    return positionSlot;
}

// Dollars available per open slot: reserve $1 for the DEF slot (it should
// never cost more), then spread the rest across the other open slots.
// Returns null when there are no open slots.
const perOpenSlot = (remaining: number, slotMap: any) => {
    if (!slotMap) return null;
    const emptySlots = Object.values(slotMap)
        .filter((pickSlot: any) => !pickSlot?.pick?.player_id).length;
    if (emptySlots === 0) return null;
    return (remaining - 1) / Math.max(1, emptySlots - 1);
}

// …per open slot on the manager's *drafted* roster.
export const budgetPerRemainingSlot = (manager) => {
    if (!manager) return null;
    return perOpenSlot(Number(manager.manager_budget), manager.draft_picks);
}

// …per open slot in the drafter's *budget plan* (unallocated dollars spread
// across the slots that don't have a budgeted player yet).
export const budgetPerRemainingBudgetSlot = (draftContext) => {
    const remaining = Number(draftContext.draftDetails?.starting_budget) - Number(draftContext.budgetSpent);
    return perOpenSlot(remaining, draftContext.budgetedPlayers);
}

export const checkForPositionLimitHit = (managers, draftDetails, position, managerId) => {
    const manager = managers.find((manager) => manager.manager_id === managerId);
    const managerDraftPicks = manager.draft_picks;
    // managerDraftPicks is an object.  translate filter to Object.entries
    const playerPositionCount = Object.entries(managerDraftPicks).filter(([slot, pickSlot]) => pickSlot.pick.position === position).length;
    // const playerPositionCount = managerDraftPicks.filter((pick) => pick.position === position).length;
    const limitProperty = `limit_${position.toLowerCase()}`;
    // get limit from draftDetails
    const positionLimit = draftDetails[limitProperty];
    if (playerPositionCount >= positionLimit) {
        alert(`Manager ${manager.manager_name} has hit the ${position} position limit (${positionLimit})`);
    }
}

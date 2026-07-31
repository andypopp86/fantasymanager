export const findBudgetedPositionSlotByPlayerId = (budgetedPlayers, playerId) => {
    let positionSlot = null;
    Object.entries(budgetedPlayers).forEach(([slot, pickSlot]) => {
        if (pickSlot.pick.player_id === playerId) {
            positionSlot = slot;
        }
    });
    return positionSlot;
}

// Dollars available per open roster slot on the manager's *drafted* team:
// reserve $1 for the DEF slot (it should never cost more), then spread the
// rest across the other open slots. Returns null when the roster is full.
export const budgetPerRemainingSlot = (manager) => {
    if (!manager || !manager.draft_picks) return null;
    const emptySlots = Object.values(manager.draft_picks)
        .filter((pickSlot: any) => !pickSlot?.pick?.player_id).length;
    if (emptySlots === 0) return null;
    return (Number(manager.manager_budget) - 1) / Math.max(1, emptySlots - 1);
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

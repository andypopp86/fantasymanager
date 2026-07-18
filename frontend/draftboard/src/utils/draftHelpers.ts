export const findBudgetedPositionSlotByPlayerId = (budgetedPlayers, playerId) => {
    let positionSlot = null;
    Object.entries(budgetedPlayers).forEach(([slot, pickSlot]) => {
        if (pickSlot.pick.player_id === playerId) {
            positionSlot = slot;
        }
    });
    return positionSlot;
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

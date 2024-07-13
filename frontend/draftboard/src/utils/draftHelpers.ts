export const findBudgetedPositionSlotByPlayerId = (budgetedPlayers, playerId) => {
    let positionSlot = null;
    Object.entries(budgetedPlayers).forEach(([slot, pick]) => {
        if (pick.player_id === playerId) {
            positionSlot = slot;
        }
    });
    return positionSlot;
}


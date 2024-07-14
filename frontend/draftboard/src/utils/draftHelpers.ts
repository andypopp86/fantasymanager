export const positionEligibleSlots = {
    "QB1": ["QB"],
    "RB1": ["RB"],
    "RB2": ["RB"],
    "WR1": ["WR"],
    "WR2": ["WR"],
    "TE1": ["TE"],
    "FLEX1": ["RB", "WR", "TE"],
    "FLEX2": ["RB", "WR", "TE"],
    "DEF1": ["DEF"],
    "BENCH1": ["QB", "RB", "WR", "TE", "DEF"],
    "BENCH2": ["QB", "RB", "WR", "TE", "DEF"],
    "BENCH3": ["QB", "RB", "WR", "TE", "DEF"],
    "BENCH4": ["QB", "RB", "WR", "TE", "DEF"],
    "BENCH5": ["QB", "RB", "WR", "TE", "DEF"],
    "BENCH6": ["QB", "RB", "WR", "TE", "DEF"],
    "BENCH7": ["QB", "RB", "WR", "TE", "DEF"],
}

export const findBudgetedPositionSlotByPlayerId = (budgetedPlayers, playerId) => {
    let positionSlot = null;
    Object.entries(budgetedPlayers).forEach(([slot, pick]) => {
        if (pick.player_id === playerId) {
            positionSlot = slot;
        }
    });
    return positionSlot;
}

export const getEmptyBudgetedPositionSlots = (budgetedPlayers) => {
    let emptySlots = [];
    Object.entries(budgetedPlayers).forEach(([slot, pick]) => {
        if (!pick.player_id) {
            emptySlots.push(slot);
        }
    });
    return emptySlots;
}

export const getPlayerEligibleBudgetSlots = (player, slots) => {
    return slots.filter((slot) => {
        const eligibleSlots = positionEligibleSlots[slot]
        if (eligibleSlots.includes(player.position)) { return slot }
    })
}
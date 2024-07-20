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
    Object.entries(budgetedPlayers).forEach(([slot, pickSlot]) => {
        if (pickSlot.pick.player_id === playerId) {
            positionSlot = slot;
        }
    });
    return positionSlot;
}

export const getEmptyBudgetedPositionSlots = (budgetedPlayers) => {
    let emptySlots = [];
    Object.entries(budgetedPlayers).forEach(([slot, pickSlot]) => {
        if (!pickSlot.pick.player_id) {
            emptySlots.push(slot);
        }
    });
    return emptySlots;
}

export const getPlayerEligibleBudgetSlots = (budgetedPlayers, draftedPlayers, player, slots) => {
    let existingBudgetedSlot = findBudgetedPositionSlotByPlayerId(budgetedPlayers, player.id);
    if (existingBudgetedSlot) {
        return [existingBudgetedSlot];
    }
    let openEligibleSlots = slots.filter((slot) => {
        const eligibleSlots = positionEligibleSlots[slot]
        if (eligibleSlots.includes(player.position)) { return slot }
    })
    if (openEligibleSlots.length > 0) {
        return openEligibleSlots;
    } else {
        const anyEligibleSlot = [];
        Object.entries(draftedPlayers).forEach(([slot, pickSlot]) => {
            if (pickSlot.allowed_positions.includes(player.position) && !pickSlot.pick.player_id) {
                anyEligibleSlot.push(slot);
            }
        });
        return anyEligibleSlot;
    }
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

export const managersWhoHitPositionLimit = (managers, draftDetails, position) => {
    let managersHit = [];
    managers.forEach((manager) => {
        const managerDraftPicks = manager.draft_picks;
        const playerPositionCount = Object.entries(managerDraftPicks).filter(([slot, pick]) => pick.position === position).length;
        const limitProperty = `limit_${position.toLowerCase()}`;
        // get limit from draftDetails
        const positionLimit = draftDetails[limitProperty];
        if (playerPositionCount >= positionLimit) {
            managersHit.push(manager.manager_name);
        }
    });
    return managersHit;
}

export const getAllPositionLimitsHit = (managers, draftDetails) => {
    let limitsHit = {};
    managers.forEach((manager) => {
        limitsHit[manager.manager_name] = [];
        Object.entries(draftDetails).forEach(([key, value]) => {
            if (key.includes('limit')) {
                const position = key.split('_')[1].toUpperCase();
                const managerDraftPicks = manager.draft_picks;
                const playerPositionCount = managerDraftPicks.filter((pick) => pick.position === position).length;
                if (playerPositionCount >= value) {
                    limitsHit[manager.manager_name].push(position);
                }
            }
        });
    });
    return limitsHit;
}

export const recalculateBudget = (startingBudget, budgetedPlayers) => {
    return startingBudget - Object.entries(budgetedPlayers).reduce((acc, [positionSlot, pickSlot]) => {
        return acc + pickSlot.pick.actual_price;
    }, 0);
}
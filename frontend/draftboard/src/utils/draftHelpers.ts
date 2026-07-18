type SlotPlayer = { player_id: number; position: string; price: number };

// Ordered concrete slots each position-list maps onto; each list's max = its slot count.
const SLOT_NAMES: Record<string, string[]> = {
    QB: ["QB1"],
    RB: ["RB1", "RB2"],
    WR: ["WR1", "WR2"],
    TE: ["TE1"],
    FLEX: ["FLEX1", "FLEX2"],
    DEF: ["DEF1"],
    BENCH: ["BENCH1", "BENCH2", "BENCH3", "BENCH4", "BENCH5", "BENCH6", "BENCH7"],
};
const FLEX_ELIGIBLE = ["RB", "WR", "TE"];

/**
 * Auto-slot a roster: sort by price desc, fill each position list to its max
 * (QB1/RB2/WR2/TE1/FLEX2/DEF1/BENCH7); overflow RB/WR/TE spills to FLEX then BENCH.
 * Returns a { slotName: player_id } map for the filled slots. Assumes <= 16 players.
 */
export const autoSlotAssignments = (players: SlotPlayer[]): Record<string, number> => {
    const lists: Record<string, SlotPlayer[]> = { QB: [], RB: [], WR: [], TE: [], FLEX: [], DEF: [], BENCH: [] };
    const tryPush = (key: string, player: SlotPlayer) => {
        if (lists[key] && lists[key].length < SLOT_NAMES[key].length) {
            lists[key].push(player);
            return true;
        }
        return false;
    };

    const sorted = [...players].sort((a, b) => b.price - a.price);
    for (const player of sorted) {
        if (tryPush(player.position, player)) continue;
        if (FLEX_ELIGIBLE.includes(player.position) && tryPush("FLEX", player)) continue;
        tryPush("BENCH", player);
    }

    const assignments: Record<string, number> = {};
    Object.keys(SLOT_NAMES).forEach((key) => {
        lists[key].forEach((player, idx) => {
            assignments[SLOT_NAMES[key][idx]] = player.player_id;
        });
    });
    return assignments;
};

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

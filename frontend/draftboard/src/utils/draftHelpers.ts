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

// The effective-ADP rank of an available-players row (1 = first off the board).
// Missing/unparseable sorts LAST rather than first, so a row without an ADP
// never jumps the queue ahead of ranked players.
export const adpRank = (row: any) => {
    const rank = parseInt(String(row?.player?.adp_formatted ?? ""), 10);
    return Number.isNaN(rank) ? Number.MAX_SAFE_INTEGER : rank;
};

// Favorite is tri-state: true = target, null/undefined = neutral, false = avoid.
// Ranked into a number so it can be sorted DESCENDING without hitting the null
// trap the server's `favorite_rank` annotation exists for.
export const favoriteRank = (row: any) => {
    const favorite = row?.player?.favorite;
    if (favorite === true) return 2;
    if (favorite === false) return 0;
    return 1;
};

// Tiebreak for every available-players sort, mirroring the server's ordering:
// targets first, then by ADP. Prices cluster hard at the bottom — there are
// dozens of $1 players — so without a secondary key equal-priced rows land in
// whatever order Dexie yields them (primary-key order, i.e. by player_id),
// which reads as random. Hearts float their tier to the top of the tail, and
// ADP puts the rest in roughly the order the league will take them.
export const byFavoriteThenAdp = (a: any, b: any) =>
    (favoriteRank(b) - favoriteRank(a)) || (adpRank(a) - adpRank(b));

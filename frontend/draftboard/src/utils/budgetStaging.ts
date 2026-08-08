// Pure staging logic behind BudgetStagingModal — the modal owns the clicking,
// this owns what the clicks MEAN. Same split as strategyShuffle.ts/RebudgetModal.

export type StagedOccupant = {
    // The player_id EXACTLY as the server sent it (a number). Never coerce this
    // on its way to a mutation: Dexie compound keys are type-sensitive, so
    // budget_picks.delete([draftId, "2"]) does not match the row stored under
    // [draftId, 2] — the local row survives while the API call succeeds, and the
    // change only appears after a refetch. Use `key()` for lookups instead.
    player_id: number | string,
    name: string,
    position: string,
    price: number,
    // Pinned to its slot — no ✕, and it can't be displaced by a placement.
    // Two reasons: an already-drafted player mirrored into the budget (moving
    // them would desync the plan from the real roster), or the pick being
    // drafted right now, whose slot the budget mirrors by definition.
    locked: boolean,
};

// Identity for maps/comparisons only. Object keys are strings anyway, so this
// keeps lookups total while player_id itself stays untouched for writes.
export const key = (playerId: number | string): string => String(playerId);

export type StagedSlot = {
    slot: string,
    allowed: string[],
    pick: any,
};

export type BaselineEntry = { slot: string, player_id: number | string };

export type BudgetChanges = {
    unbudget: (number | string)[],
    place: {
        slot: string,
        player: { player_id: number | string, name: string, position: string },
        projectedPrice: number,
    }[],
};

const money = (value: any) => parseInt(String(value)) || 0;

// Budget slots in board order, paired with their eligibility list.
export const toStagedSlots = (budgetedPlayers: Record<string, any>): StagedSlot[] =>
    Object.entries(budgetedPlayers)
        .sort(([, a]: [string, any], [, b]: [string, any]) => a.order - b.order)
        .map(([slot, slotObj]: [string, any]) => ({
            slot,
            allowed: slotObj.allowed_positions || [],
            pick: slotObj.pick,
        }));

// Where every budgeted player sits RIGHT NOW — the baseline diffStagedBudget
// measures the staged arrangement against. Keyed by key(player_id), but each
// entry carries the untouched player_id for the write path.
export const currentSlotByPlayer = (slots: StagedSlot[]): Record<string, BaselineEntry> => {
    const map: Record<string, BaselineEntry> = {};
    slots.forEach(({ slot, pick }) => {
        if (pick.player_id) map[key(pick.player_id)] = { slot, player_id: pick.player_id };
    });
    return map;
};

// The staged arrangement as it stands before any edits: every occupied slot
// keeps its player. A slot whose player is one of the drafter's actual draft
// picks is `locked`.
export const initialAssignments = (
    slots: StagedSlot[],
    drafterDraftPicks: Record<string, any> | undefined,
): Record<string, StagedOccupant | null> => {
    const assignments: Record<string, StagedOccupant | null> = {};
    slots.forEach(({ slot, pick }) => {
        assignments[slot] = pick.player_id
            ? {
                player_id: pick.player_id,
                name: pick.player_name,
                position: pick.position,
                // Mirrors budgetSpent's rule: the real price wins once paid.
                price: money(pick.actual_price) || money(pick.projected_price),
                locked: String(drafterDraftPicks?.[slot]?.pick?.player_id || "") === String(pick.player_id),
            }
            : null;
    });
    return assignments;
};

export type Incoming = {
    player_id: number | string,
    name: string,
    position: string,
    price: number,
};

export type Staging = {
    assignments: Record<string, StagedOccupant | null>,
    tray: StagedOccupant[],
    selectedKey: string | null,
};

// Opening state for the modal, for both entry points.
//
// `pinnedSlot` is what separates them. Budgeting from the tier board leaves it
// null: the player starts in the tray and the user picks a slot. Drafting sets
// it, because the budget MIRRORS the roster — the drafted player's slot isn't a
// choice, so they're pre-placed and locked, and whoever they displaced starts in
// the tray already armed (that displacement being the whole reason we stopped).
//
// Either way the incoming player is first cleared from any slot they already
// occupy, so a player budgeted at RB1 and drafted into FLEX1 can't end up staged
// in both.
export const initialStaging = (
    slots: StagedSlot[],
    drafterDraftPicks: Record<string, any> | undefined,
    incoming: Incoming,
    pinnedSlot: string | null,
): Staging => {
    const assignments = initialAssignments(slots, drafterDraftPicks);
    const incomingKey = key(incoming.player_id);

    const existingSlot = Object.keys(assignments)
        .find((slot) => assignments[slot] && key(assignments[slot]!.player_id) === incomingKey) || null;

    if (!pinnedSlot) {
        // Already budgeted somewhere: show them in place rather than asking the
        // user to re-place a player who is already in the plan.
        if (existingSlot) return { assignments, tray: [], selectedKey: null };
        return {
            assignments,
            tray: [{ ...incoming, locked: false }],
            selectedKey: incomingKey,
        };
    }

    if (existingSlot && existingSlot !== pinnedSlot) assignments[existingSlot] = null;
    const displaced = assignments[pinnedSlot];
    assignments[pinnedSlot] = { ...incoming, locked: true };

    const wasSamePlayer = displaced && key(displaced.player_id) === incomingKey;
    return {
        assignments,
        tray: displaced && !wasSamePlayer ? [displaced] : [],
        selectedKey: displaced && !wasSamePlayer ? key(displaced.player_id) : null,
    };
};

export const isEligible = (slot: StagedSlot, occupant: StagedOccupant | null): boolean =>
    !!occupant && slot.allowed.includes(occupant.position);

export const stagedSpend = (
    slots: StagedSlot[],
    assignments: Record<string, StagedOccupant | null>,
): number => slots.reduce((acc, { slot }) => acc + (assignments[slot]?.price || 0), 0);

// Diff the staged arrangement against the baseline into the two ordered lists
// applyBudgetChanges expects.
//
// `unbudget` is REMOVALS ONLY — players in the baseline with no staged slot.
// A mover must NOT be unbudgeted first, even though that looks like the safe
// belt-and-braces move: `unbudget_pick` nulls the row's manager while
// `budget_pick` matches on `get_or_create(..., manager_id=...)`, so
// unbudget-then-budget on one player leaves the nulled row behind and creates a
// second one. Re-budgeting alone MOVES the row, which is the documented
// behaviour.
//
// That's safe here because staging guarantees the invariant the move relies on:
// every player is either placed somewhere or sitting in the tray, so a
// displaced player is always either moved or unbudgeted — never orphaned at a
// slot someone else now occupies.
//
// A player who didn't move appears in neither list — untouched rows cost no
// writes.
export const diffStagedBudget = (
    slots: StagedSlot[],
    assignments: Record<string, StagedOccupant | null>,
    baseline: Record<string, BaselineEntry>,
): BudgetChanges => {
    const stagedSlotByPlayer: Record<string, string> = {};
    slots.forEach(({ slot }) => {
        const occupant = assignments[slot];
        if (occupant) stagedSlotByPlayer[key(occupant.player_id)] = slot;
    });

    // Values, not Object.keys — the keys are stringified ids, and a stringified
    // id must never reach a mutation (see StagedOccupant.player_id).
    const unbudget = Object.values(baseline)
        .filter((entry) => !stagedSlotByPlayer[key(entry.player_id)])
        .map((entry) => entry.player_id);

    const place = slots
        .map(({ slot }) => ({ slot, occupant: assignments[slot] }))
        .filter((entry): entry is { slot: string, occupant: StagedOccupant } =>
            !!entry.occupant && baseline[key(entry.occupant.player_id)]?.slot !== entry.slot)
        .map(({ slot, occupant }) => ({
            slot,
            player: {
                player_id: occupant.player_id,
                name: occupant.name,
                position: occupant.position,
            },
            projectedPrice: occupant.price,
        }));

    return { unbudget, place };
};

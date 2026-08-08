// Pure staging logic behind BudgetFromTierModal — the modal owns the clicking,
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
    // An actually-drafted player mirrored into the budget. Locked: moving or
    // removing it here would desync the plan from the real roster.
    drafted: boolean,
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
// keeps its player. A slot whose player is the drafter's actual draft pick is
// flagged `drafted` and is locked in the UI.
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
                drafted: String(drafterDraftPicks?.[slot]?.pick?.player_id || "") === String(pick.player_id),
            }
            : null;
    });
    return assignments;
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

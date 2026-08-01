import type { PlayerDetail, SlotName } from "../lib/draft.schemas";

// Strategy-based budget shuffle: given the drafter's OPEN slots (no actual
// drafted player), their remaining real budget, and the favorited player
// pool, produce a ladder of dollar RUNGS by strategy, then — biggest rung
// first — randomly pick a favorite priced within ±variation of the rung and
// slot them into whichever eligible open slot remains. Rungs are
// slot-agnostic: slots are chosen by the picked player's position, never
// pre-assigned an amount. Pure functions — the modal re-rolls by calling
// shuffleFavorites again.

export type ShuffleStrategy = "cheap_bench" | "even_all" | "laddered";

export const STRATEGY_LABELS: Record<ShuffleStrategy, string> = {
    cheap_bench: "Cheap bench, even starters",
    even_all: "Even money, all slots",
    laddered: "Laddered (big to small)",
};

export type OpenSlot = {
    slot: SlotName,
    order: number,
    allowed_positions: string[],
};

export type FavoriteCandidate = {
    player: PlayerDetail,
    price: number,
};

export type RungProposal = {
    allocation: number,
    player: PlayerDetail | null,
    price: number,
    slot: SlotName | null,
};

const isBench = (slot: string) => slot.startsWith("BENCH");
const isDef = (slot: string) => slot.startsWith("DEF");

// Laddered decay: each rung is ~73% of the previous, which reproduces the
// 55/40/30/25/20/… shape of a $200 full-roster ladder.
const LADDER_DECAY = 0.73;

// Spread `budget` proportionally to `weights`, $1 floor per rung, pushing
// rounding drift into the largest rung so the total matches exactly.
const distribute = (weights: number[], budget: number): number[] => {
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const amounts = weights.map((w) => Math.max(1, Math.round((budget * w) / total)));
    const drift = budget - amounts.reduce((a, b) => a + b, 0);
    if (amounts.length > 0 && drift !== 0) {
        const i = amounts.indexOf(Math.max(...amounts));
        amounts[i] = Math.max(1, amounts[i] + drift);
    }
    return amounts;
};

// The rung ladder for the strategy, sorted descending. One rung per open
// slot. DEF contributes a $1 rung in every strategy (league convention —
// the budget-per-slot strips reserve $1 for it too).
export const computeRungs = (
    strategy: ShuffleStrategy,
    openSlots: OpenSlot[],
    remainingBudget: number,
): number[] => {
    const defCount = openSlots.filter(({ slot }) => isDef(slot)).length;
    const benchCount = openSlots.filter(({ slot }) => isBench(slot)).length;
    const restCount = openSlots.length - defCount;
    const budget = Math.max(restCount, remainingBudget - defCount);

    let rungs: number[];
    if (strategy === "cheap_bench") {
        const starterCount = restCount - benchCount;
        const starterBudget = Math.max(starterCount, budget - benchCount);
        rungs = [
            ...distribute(Array(starterCount).fill(1), starterBudget),
            ...Array(benchCount).fill(1),
        ];
    } else if (strategy === "even_all") {
        rungs = distribute(Array(restCount).fill(1), budget);
    } else {
        rungs = distribute(
            Array.from({ length: restCount }, (_, i) => LADDER_DECAY ** i), budget);
    }
    rungs.push(...Array(defCount).fill(1));
    return rungs.sort((a, b) => b - a);
};

// Default lock heuristic. The common reason to shuffle mid-draft is "I just
// paid more than planned and must downgrade someone expensive" — so when the
// planned budget is OVER (budgetSpent > startingBudget), auto-unlock the
// priciest budgeted players until their planned dollars cover the overage.
// At/under budget nothing is auto-unlocked; empty slots are always shuffle-
// eligible and drafted slots always locked (handled by the caller).
export const defaultUnlockedSlots = (
    budgeted: { slot: SlotName, price: number }[],
    overage: number,
): Set<SlotName> => {
    const unlocked = new Set<SlotName>();
    if (overage <= 0) return unlocked;
    let freed = 0;
    for (const { slot, price } of [...budgeted].sort((a, b) => b.price - a.price)) {
        unlocked.add(slot);
        freed += price;
        if (freed >= overage) break;
    }
    return unlocked;
};

export const shuffleFavorites = (
    openSlots: OpenSlot[],
    rungs: number[],
    favorites: FavoriteCandidate[],
    variation: number = 2,
    rng: () => number = Math.random,
): RungProposal[] => {
    const pool = [...favorites];
    const slotsLeft = [...openSlots];

    // Where a picked player lands: the most SPECIFIC eligible slot first
    // (TE1 before FLEX1 before BENCH), so flex/bench stay open for later
    // rungs.
    const takeSlotFor = (player: PlayerDetail): OpenSlot | null => {
        const eligible = slotsLeft
            .filter(({ allowed_positions }) => allowed_positions.includes(player.position))
            .sort((a, b) =>
                a.allowed_positions.length - b.allowed_positions.length || a.order - b.order);
        if (eligible.length === 0) return null;
        slotsLeft.splice(slotsLeft.indexOf(eligible[0]), 1);
        return eligible[0];
    };

    return rungs.map((allocation) => {
        const lo = Math.max(1, allocation - variation);
        const hi = allocation + variation;
        const candidates = pool.filter(({ player, price }) =>
            price >= lo && price <= hi &&
            slotsLeft.some(({ allowed_positions }) => allowed_positions.includes(player.position)));

        if (candidates.length === 0) {
            return { allocation, player: null, price: 0, slot: null };
        }
        const picked = candidates[Math.floor(rng() * candidates.length)];
        pool.splice(pool.indexOf(picked), 1);
        const slot = takeSlotFor(picked.player);
        return {
            allocation,
            player: picked.player,
            price: picked.price,
            slot: slot?.slot ?? null,
        };
    });
};

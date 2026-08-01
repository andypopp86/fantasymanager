import type { PlayerDetail, SlotName } from "../lib/draft.schemas";

// Strategy-based budget shuffle: given the drafter's OPEN slots (no actual
// drafted player), their remaining real budget, and the favorited player
// pool, produce a per-slot dollar target by strategy and randomly pick
// favorites whose market price plausibly fits each target. Pure functions —
// the modal re-rolls by calling shuffleFavorites again.

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

export type SlotProposal = {
    slot: SlotName,
    order: number,
    allocation: number,
    player: PlayerDetail | null,
    price: number,
};

const isBench = (slot: string) => slot.startsWith("BENCH");
const isDef = (slot: string) => slot.startsWith("DEF");

// Laddered decay: each rung is ~73% of the previous, which reproduces the
// 55/40/30/25/20/… shape of a $200 full-roster ladder.
const LADDER_DECAY = 0.73;

// Spread `budget` over `slots` proportionally to `weights`, $1 floor per
// slot, and push rounding drift into the largest rung so totals match.
const distribute = (slots: OpenSlot[], weights: number[], budget: number): Map<SlotName, number> => {
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const amounts = weights.map((w) => Math.max(1, Math.round((budget * w) / total)));
    let drift = budget - amounts.reduce((a, b) => a + b, 0);
    // Largest rung absorbs the drift (never below the $1 floor).
    if (amounts.length > 0 && drift !== 0) {
        const i = amounts.indexOf(Math.max(...amounts));
        amounts[i] = Math.max(1, amounts[i] + drift);
    }
    return new Map(slots.map(({ slot }, i) => [slot, amounts[i]]));
};

export const computeAllocations = (
    strategy: ShuffleStrategy,
    openSlots: OpenSlot[],
    remainingBudget: number,
): Map<SlotName, number> => {
    const ordered = [...openSlots].sort((a, b) => a.order - b.order);
    // DEF is pinned to $1 in every strategy (league convention — the
    // budget-per-slot strips reserve $1 for it too).
    const def = ordered.filter(({ slot }) => isDef(slot));
    const rest = ordered.filter(({ slot }) => !isDef(slot));
    const budget = Math.max(rest.length, remainingBudget - def.length);

    let allocations: Map<SlotName, number>;
    if (strategy === "cheap_bench") {
        const starters = rest.filter(({ slot }) => !isBench(slot));
        const bench = rest.filter(({ slot }) => isBench(slot));
        const starterBudget = Math.max(starters.length, budget - bench.length);
        allocations = distribute(starters, starters.map(() => 1), starterBudget);
        bench.forEach(({ slot }) => allocations.set(slot, 1));
    } else if (strategy === "even_all") {
        allocations = distribute(rest, rest.map(() => 1), budget);
    } else {
        // laddered: biggest rung to the earliest open slot, decaying down
        // through the bench.
        allocations = distribute(rest, rest.map((_, i) => LADDER_DECAY ** i), budget);
    }
    def.forEach(({ slot }) => allocations.set(slot, 1));
    return allocations;
};

// A favorite "fits" a rung when its market price is in a band around the
// target. Cheap rungs (≤ $3) just need a cheap player.
const fits = (price: number, allocation: number): boolean => {
    if (allocation <= 3) return price <= 3;
    return price >= allocation * 0.55 && price <= allocation * 1.25;
};

export const shuffleFavorites = (
    openSlots: OpenSlot[],
    allocations: Map<SlotName, number>,
    favorites: FavoriteCandidate[],
    rng: () => number = Math.random,
): SlotProposal[] => {
    const pool = [...favorites];
    const proposals: SlotProposal[] = [];
    // Fill the expensive rungs first so big-money slots get first pick of
    // the pool.
    const byAllocationDesc = [...openSlots].sort(
        (a, b) => (allocations.get(b.slot) ?? 0) - (allocations.get(a.slot) ?? 0));

    byAllocationDesc.forEach(({ slot, order, allowed_positions }) => {
        const allocation = allocations.get(slot) ?? 1;
        const candidates = pool.filter(({ player, price }) =>
            allowed_positions.includes(player.position) && fits(price, allocation));
        let picked: FavoriteCandidate | null = null;
        if (candidates.length > 0) {
            picked = candidates[Math.floor(rng() * candidates.length)];
            pool.splice(pool.indexOf(picked), 1);
        }
        proposals.push({
            slot,
            order,
            allocation,
            player: picked?.player ?? null,
            price: picked?.price ?? 0,
        });
    });

    return proposals.sort((a, b) => a.order - b.order);
};

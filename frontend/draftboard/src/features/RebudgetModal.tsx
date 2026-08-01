import React, { useMemo, useState } from "react";
import { applyPlanSelections } from "../lib/mutations";
import {
    STRATEGY_LABELS,
    computeRungs,
    defaultUnlockedSlots,
    shuffleFavorites,
} from "../utils/strategyShuffle";
import type { ShuffleStrategy, OpenSlot, FavoriteCandidate, RungProposal } from "../utils/strategyShuffle";

// Strategy-based budget shuffle (see utils/strategyShuffle.ts). Locked slots
// (🔒 column) keep their current occupant and their planned dollars stay
// committed; the shuffle runs only over unlocked slots with the uncommitted
// budget. Default locks come from defaultUnlockedSlots — over budget, the
// priciest budgeted players start unlocked (the "downgrade someone" case).
// Apply goes through the same mutation sequence as the plan page and only
// touches unlocked slots that received a proposal.
export default function RebudgetModal({ draftContext, onClose }) {
    const { draftId, drafterId, managers, budgetedPlayers, undraftedPlayers, budgetSpent, draftDetails } = draftContext;
    const startingBudget = Number(draftDetails?.starting_budget) || 0;

    const drafter = managers.find((manager) => manager.is_drafter);
    const remainingBudget = drafter?.manager_budget ?? 0;
    const draftedSpend = startingBudget - remainingBudget;

    const [strategy, setStrategy] = useState<ShuffleStrategy>("laddered");
    const [variation, setVariation] = useState(2);
    const [proposals, setProposals] = useState<RungProposal[] | null>(null);
    const [applying, setApplying] = useState(false);

    // locked[slot] only tracks slots that HAVE a budget occupant; empty
    // slots are always shuffle-eligible, drafted slots always locked.
    const [locked, setLocked] = useState<Record<string, boolean>>(() => {
        if (!drafter) return {};
        const budgeted = Object.entries(budgetedPlayers)
            .filter(([slot, { pick }]: [string, any]) =>
                pick.player_id && !drafter.draft_picks[slot]?.pick?.player_id)
            .map(([slot, { pick }]: [string, any]) => ({ slot, price: Number(pick.projected_price) || 0 }));
        const overage = Math.max(0, budgetSpent - startingBudget);
        const unlock = defaultUnlockedSlots(budgeted, overage);
        return Object.fromEntries(budgeted.map(({ slot }) => [slot, !unlock.has(slot)]));
    });

    const toggleLock = (slot: string) => {
        setLocked((prev) => ({ ...prev, [slot]: !prev[slot] }));
        setProposals(null); // lock changes invalidate the current proposal
    };

    // Slots the shuffle may fill: not drafted, and not locked.
    const shuffleSlots: OpenSlot[] = useMemo(() => {
        if (!drafter) return [];
        return Object.entries(budgetedPlayers)
            .filter(([slot, { pick }]: [string, any]) =>
                !drafter.draft_picks[slot]?.pick?.player_id &&
                !(pick.player_id && locked[slot]))
            .map(([slot, { order, allowed_positions }]: [string, any]) => ({ slot, order, allowed_positions }));
    }, [drafter, budgetedPlayers, locked]);

    // Planned dollars committed by locked budget occupants.
    const lockedSpend = useMemo(() =>
        Object.entries(budgetedPlayers)
            .filter(([slot, { pick }]: [string, any]) =>
                pick.player_id && locked[slot] && !drafter?.draft_picks[slot]?.pick?.player_id)
            .reduce((acc, [, { pick }]: [string, any]) => acc + (Number(pick.projected_price) || 0), 0),
        [budgetedPlayers, locked, drafter]);

    // Locked-in-place players can't be proposed for another slot.
    const favorites: FavoriteCandidate[] = useMemo(() => {
        const lockedIds = new Set(
            Object.entries(budgetedPlayers)
                .filter(([slot, { pick }]: [string, any]) => pick.player_id && locked[slot])
                .map(([, { pick }]: [string, any]) => String(pick.player_id)));
        return undraftedPlayers
            .filter(({ player }) => player.favorite && !lockedIds.has(String(player.player_id)))
            .map(({ player, projected_price }) => ({ player, price: Number(projected_price) || 0 }));
    }, [undraftedPlayers, budgetedPlayers, locked]);

    const shuffle = () => {
        const shuffleBudget = startingBudget - draftedSpend - lockedSpend;
        const rungs = computeRungs(strategy, shuffleSlots, shuffleBudget);
        setProposals(shuffleFavorites(shuffleSlots, rungs, favorites, variation));
    };

    const filled = proposals?.filter((p) => p.player && p.slot) ?? [];
    const proposedSpend = filled.reduce((acc, p) => acc + p.price, 0);
    const unfilledRungs = proposals?.filter((p) => !p.player) ?? [];

    // One row per roster slot: lock state, CURRENT occupant (drafted player
    // or budget pick), and the shuffle's PROPOSED player if any.
    const displayRows = useMemo(() => {
        if (!drafter) return [];
        const proposalBySlot = Object.fromEntries(
            (proposals ?? []).filter((p) => p.slot).map((p) => [p.slot, p]));
        return Object.entries(budgetedPlayers)
            .map(([slot, { order, pick }]: [string, any]) => {
                const draftedPick = drafter.draft_picks[slot]?.pick;
                const drafted = Boolean(draftedPick?.player_id);
                const current = drafted
                    ? { name: draftedPick.name, position: draftedPick.position, price: Number(draftedPick.price) || 0 }
                    : pick.player_id
                        ? { name: pick.player_name, position: pick.position, price: Number(pick.projected_price) || 0 }
                        : null;
                const isLocked = drafted || Boolean(pick.player_id && locked[slot]);
                const proposal = isLocked ? null : proposalBySlot[slot];
                return {
                    key: slot,
                    slot,
                    order,
                    drafted,
                    lockable: !drafted && Boolean(pick.player_id),
                    isLocked,
                    current,
                    proposed: proposal?.player
                        ? { name: proposal.player.name, position: proposal.player.position, price: proposal.price }
                        : null,
                };
            })
            .sort((a, b) => a.order - b.order);
    }, [proposals, drafter, budgetedPlayers, locked]);

    const currentSpend = displayRows.reduce((acc, r) => acc + (r.current?.price ?? 0), 0);
    // Locked rows keep their planned dollars in the proposed world.
    const proposedTotal = draftedSpend + lockedSpend + proposedSpend;

    const apply = async () => {
        if (filled.length === 0) return;
        setApplying(true);
        try {
            await applyPlanSelections(draftId, drafterId, filled.map(({ slot, player, price }) => ({
                slot,
                player: { player_id: player.player_id, name: player.name, position: player.position },
                projectedPrice: price,
            })));
            onClose();
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-4 w-full max-w-xl max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-bold">Rebudget</h2>
                    <button className="text-gray-500 hover:text-gray-800" onClick={onClose}>✕</button>
                </div>

                <div className="flex gap-2 items-center mb-3 flex-wrap">
                    <select
                        className="border rounded px-2 py-1 bg-gray-100"
                        value={strategy}
                        onChange={(e) => { setStrategy(e.target.value as ShuffleStrategy); setProposals(null); }}
                    >
                        {Object.entries(STRATEGY_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                    <label className="text-sm text-gray-600 flex items-center gap-1" title="A player fits a rung when priced within ± this many dollars of it">
                        ±$
                        <input
                            type="number" min={0} max={50}
                            className="border rounded px-1 py-1 w-14 bg-gray-100"
                            value={variation}
                            onChange={(e) => setVariation(Math.max(0, parseInt(e.target.value) || 0))}
                        />
                    </label>
                    <button className="btn bg-blue-500 text-white rounded px-3 py-1" onClick={shuffle}>
                        {proposals ? "Re-shuffle" : "Shuffle"}
                    </button>
                    <span className="text-sm ml-auto" title="Current plan (drafted + budgeted) vs starting budget">
                        <span className={"font-bold " + (currentSpend > startingBudget ? "text-red-600" : "text-green-700")}>
                            {currentSpend === startingBudget
                                ? "ON BUDGET"
                                : `$${Math.abs(currentSpend - startingBudget)} ${currentSpend > startingBudget ? "OVER" : "UNDER"} BUDGET`}
                        </span>
                        <span className="text-gray-600"> · {favorites.length} favorites</span>
                    </span>
                </div>

                {favorites.length === 0 && (
                    <p className="text-sm text-orange-600 mb-2">
                        No favorited players available — star some players first.
                    </p>
                )}

                <table className="min-w-full text-sm mb-1">
                    <thead>
                        <tr className="bg-gray-200 text-gray-600 text-left">
                            <th className="px-2 py-1" title="Locked slots keep their player and are skipped by the shuffle">🔒</th>
                            <th className="px-2 py-1">Slot</th>
                            <th className="px-2 py-1">Current</th>
                            <th className="px-2 py-1 text-right">$</th>
                            <th className="px-2 py-1 border-l">Proposed</th>
                            <th className="px-2 py-1 text-right">$</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.map(({ key, slot, drafted, lockable, isLocked, current, proposed }) => (
                            <tr key={key} className={"border-b " + (drafted ? "bg-gray-100 text-gray-500" : isLocked ? "bg-gray-50" : "")}>
                                <td className="px-2 py-1">
                                    <input
                                        type="checkbox"
                                        checked={isLocked}
                                        disabled={!lockable}
                                        onChange={() => toggleLock(slot)}
                                        title={drafted ? "Drafted — always locked" : current ? (isLocked ? "Locked — kept as is" : "Unlocked — will be shuffled") : "Empty — always shuffled"}
                                    />
                                </td>
                                <td className="px-2 py-1 font-semibold">{slot}</td>
                                <td className={"px-2 py-1 " + (current ? "" : "text-gray-400")}>
                                    {current ? `${current.name} (${current.position})` : "—"}
                                    {drafted && (
                                        <span className="ml-2 text-xs bg-gray-300 text-gray-700 rounded px-1">✓ drafted</span>
                                    )}
                                </td>
                                <td className="px-2 py-1 text-right">{current ? current.price : ""}</td>
                                <td className={"px-2 py-1 border-l " + (proposed ? "font-semibold text-green-700" : "text-gray-400")}>
                                    {isLocked ? "" : proposed ? `${proposed.name} (${proposed.position})` : proposals ? "—" : ""}
                                </td>
                                <td className="px-2 py-1 text-right font-semibold text-green-700">
                                    {proposed ? proposed.price : ""}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="font-bold border-t-2">
                            <td className="px-2 py-1" colSpan={2}>Total</td>
                            <td className={"px-2 py-1 text-right " + (currentSpend > startingBudget ? "text-red-600" : "")}
                                colSpan={2} title={`$${draftedSpend} drafted + $${currentSpend - draftedSpend} budgeted`}>
                                {currentSpend} / {startingBudget}
                            </td>
                            <td className={"px-2 py-1 text-right border-l " + (proposedTotal > startingBudget ? "text-red-600" : "")}
                                colSpan={2}
                                title={proposals ? `$${draftedSpend} drafted + $${lockedSpend} locked + $${proposedSpend} proposed` : ""}>
                                {proposals ? `${proposedTotal} / ${startingBudget}` : ""}
                            </td>
                        </tr>
                    </tfoot>
                </table>
                {unfilledRungs.length > 0 && (
                    <p className="text-xs text-orange-600 mb-3">
                        {unfilledRungs.length} rung{unfilledRungs.length === 1 ? "" : "s"} unfilled
                        (${unfilledRungs.map((p) => p.allocation).join(", $")}) — re-shuffle, widen ±$,
                        or favorite more players at those prices.
                    </p>
                )}

                <div className="flex justify-end gap-2 mt-2">
                    <button className="btn border rounded px-3 py-1" onClick={onClose}>Cancel</button>
                    <button
                        className="btn bg-green-500 text-white rounded px-3 py-1 disabled:opacity-50"
                        disabled={filled.length === 0 || applying}
                        onClick={apply}
                        title="Replaces budgeted players in unlocked slots that received a proposal"
                    >
                        {applying ? "Applying…" : `Apply ${filled.length} picks`}
                    </button>
                </div>
            </div>
        </div>
    );
}

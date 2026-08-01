import React, { useMemo, useState } from "react";
import { applyPlanSelections } from "../lib/mutations";
import {
    STRATEGY_LABELS,
    computeRungs,
    shuffleFavorites,
} from "../utils/strategyShuffle";
import type { ShuffleStrategy, OpenSlot, FavoriteCandidate, RungProposal } from "../utils/strategyShuffle";

// Strategy-based budget shuffle (see utils/strategyShuffle.ts). Reads the
// live draftContext, proposes a random favorites-only budget per the chosen
// strategy, and applies through the same mutation sequence as the plan page.
// Rungs are slot-agnostic: the slot column shows where each picked player
// landed. Rungs with no fitting favorite stay empty on purpose — re-roll,
// widen the ± variation, or favorite more players at that price point.
export default function StrategyShuffleModal({ draftContext, onClose }) {
    const { draftId, drafterId, managers, budgetedPlayers, undraftedPlayers } = draftContext;
    const [strategy, setStrategy] = useState<ShuffleStrategy>("laddered");
    const [variation, setVariation] = useState(2);
    const [proposals, setProposals] = useState<RungProposal[] | null>(null);
    const [applying, setApplying] = useState(false);

    const drafter = managers.find((manager) => manager.is_drafter);
    const remainingBudget = drafter?.manager_budget ?? 0;

    // Open = the drafter has no actually-drafted player in the slot. Order
    // and eligibility come from the budget projection (same slot template).
    const openSlots: OpenSlot[] = useMemo(() => {
        if (!drafter) return [];
        return Object.entries(budgetedPlayers)
            .filter(([slot]) => !drafter.draft_picks[slot]?.pick?.player_id)
            .map(([slot, { order, allowed_positions }]: [string, any]) => ({ slot, order, allowed_positions }));
    }, [drafter, budgetedPlayers]);

    const favorites: FavoriteCandidate[] = useMemo(() =>
        undraftedPlayers
            .filter(({ player }) => player.favorite)
            .map(({ player, projected_price }) => ({ player, price: Number(projected_price) || 0 })),
        [undraftedPlayers]);

    const shuffle = () => {
        const rungs = computeRungs(strategy, openSlots, remainingBudget);
        setProposals(shuffleFavorites(openSlots, rungs, favorites, variation));
    };

    const filled = proposals?.filter((p) => p.player && p.slot) ?? [];
    const proposedSpend = filled.reduce((acc, p) => acc + p.price, 0);

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
            <div className="bg-white rounded-lg shadow-xl p-4 w-full max-w-lg max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-bold">Strategy Shuffle</h2>
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
                    <span className="text-sm text-gray-600 ml-auto">
                        ${remainingBudget} left · {favorites.length} favorites
                    </span>
                </div>

                {favorites.length === 0 && (
                    <p className="text-sm text-orange-600 mb-2">
                        No favorited players available — star some players first.
                    </p>
                )}

                {proposals && (
                    <>
                        <table className="min-w-full text-sm mb-3">
                            <thead>
                                <tr className="bg-gray-200 text-gray-600 text-left">
                                    <th className="px-2 py-1 text-right">Target $</th>
                                    <th className="px-2 py-1">Player</th>
                                    <th className="px-2 py-1 text-right">Price $</th>
                                    <th className="px-2 py-1">Slot</th>
                                </tr>
                            </thead>
                            <tbody>
                                {proposals.map(({ allocation, player, price, slot }, i) => (
                                    <tr key={i} className="border-b">
                                        <td className="px-2 py-1 text-right">{allocation}</td>
                                        <td className={"px-2 py-1 " + (player ? "" : "text-gray-400 italic")}>
                                            {player ? `${player.name} (${player.position})` : "no fitting favorite"}
                                        </td>
                                        <td className="px-2 py-1 text-right">{player ? price : "—"}</td>
                                        <td className="px-2 py-1 font-semibold">{slot ?? "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-bold">
                                    <td className="px-2 py-1 text-right">
                                        {proposals.reduce((acc, p) => acc + p.allocation, 0)}
                                    </td>
                                    <td className="px-2 py-1">{filled.length}/{proposals.length} rungs</td>
                                    <td className="px-2 py-1 text-right">{proposedSpend}</td>
                                    <td className="px-2 py-1"></td>
                                </tr>
                            </tfoot>
                        </table>

                        <div className="flex justify-end gap-2">
                            <button className="btn border rounded px-3 py-1" onClick={onClose}>Cancel</button>
                            <button
                                className="btn bg-green-500 text-white rounded px-3 py-1 disabled:opacity-50"
                                disabled={filled.length === 0 || applying}
                                onClick={apply}
                                title="Replaces budgeted players in the filled slots"
                            >
                                {applying ? "Applying…" : `Apply ${filled.length} picks`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

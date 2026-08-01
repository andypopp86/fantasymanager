import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftPlansRetrieve, draftPlanCreate, draftPlanDelete } from "../lib/data";
import { applyPlanSelections } from "../lib/mutations";
import { useDraftData } from "../hooks/useDraftData";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import type { DraftPlanPlayer } from "../lib/draft.schemas";

const planPrice = (player: DraftPlanPlayer) =>
    parseInt(String(player.override_price ?? "")) || parseInt(String(player.projected_price)) || 1;

// /draft/:draftId/plan — merge a saved DraftPlan into the current budget,
// slot by slot. Each slot has a checkbox: checked slots take the plan's
// player, unchecked keep the current budget row. Slots whose budget row is an
// actually-drafted player default to UNCHECKED (protected, but overridable);
// plan players already drafted by anyone are disabled outright.
export default function DraftPlanPage() {
    const { draftId: draftIdParam } = useParams();
    const draftId = Number(draftIdParam);
    const navigate = useNavigate();
    const data = useDraftData(draftId);

    const { data: plans, refetch: refetchPlans } = useQuery({
        queryKey: ["draft_plans"],
        queryFn: () =>
            draftPlansRetrieve(),
        select: (response) => {
            return response.data;
        }
    });

    const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
    const [checkedSlots, setCheckedSlots] = useState<Record<string, boolean>>({});
    const [applying, setApplying] = useState(false);

    const selectedPlan = plans?.find((plan) => plan.id === selectedPlanId) || null;

    // player_id -> manager_name for every drafted player in this draft, to
    // flag plan players who are already gone (and protect drafted budget rows).
    const draftedBy = useMemo(() => {
        const map: Record<string, string> = {};
        data.managers.forEach((manager: any) => {
            Object.values(manager.draft_picks || {}).forEach((pickSlot: any) => {
                if (pickSlot.pick.player_id) map[String(pickSlot.pick.player_id)] = manager.manager_name;
            });
        });
        return map;
    }, [data.managers]);

    const drafter = data.managers.find((manager: any) => manager.manager_id === data.drafterId);
    const drafterName = drafter?.manager_name;

    // One row per budget slot, in board order.
    const rows = useMemo(() => {
        return Object.entries(data.budgetedPlayers).map(([slot, slotObj]: [string, any]) => {
            const current = slotObj.pick;
            const currentIsDrafted = !!current.player_id && draftedBy[String(current.player_id)] === drafterName;
            const planPlayer: DraftPlanPlayer | null = selectedPlan?.slots?.[slot] || null;
            const planTakenBy = planPlayer ? draftedBy[String(planPlayer.player_id)] : undefined;
            const samePlayer = planPlayer && String(planPlayer.player_id) === String(current.player_id);
            // Nothing to merge: empty plan slot, an unavailable player, or a no-op.
            const disabled = !planPlayer || !!planTakenBy || !!samePlayer;
            return { slot, current, currentIsDrafted, planPlayer, planTakenBy, samePlayer, disabled };
        });
    }, [data.budgetedPlayers, draftedBy, drafterName, selectedPlan]);

    // Selecting a plan resets the checkboxes to their defaults: mergeable
    // slots on, drafted-protected (and disabled) slots off.
    useEffect(() => {
        const defaults: Record<string, boolean> = {};
        rows.forEach(({ slot, disabled, currentIsDrafted }) => {
            defaults[slot] = !disabled && !currentIsDrafted;
        });
        setCheckedSlots(defaults);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPlanId, plans]);

    const toggleSlot = (slot: string) => {
        setCheckedSlots((prev) => ({ ...prev, [slot]: !prev[slot] }));
    };

    // Budget preview: current total vs. total if the checked merges apply.
    const startingBudget = Number(data.draftDetails?.starting_budget ?? drafter?.manager_budget) || 0;
    const currentPrice = (current: any) =>
        parseInt(current.actual_price) || parseInt(current.projected_price) || 0;
    const mergedSpent = rows.reduce((acc, { slot, current, planPlayer }) => {
        if (checkedSlots[slot] && planPlayer) return acc + planPrice(planPlayer);
        return acc + currentPrice(current);
    }, 0);

    const applyPlan = async () => {
        if (!selectedPlan) return;
        const selections = rows
            .filter(({ slot, planPlayer, disabled }) => checkedSlots[slot] && planPlayer && !disabled)
            .map(({ slot, planPlayer }) => ({
                slot,
                player: { player_id: planPlayer!.player_id, name: planPlayer!.name, position: planPlayer!.position },
                projectedPrice: planPrice(planPlayer!),
            }));
        if (selections.length === 0) return;
        setApplying(true);
        try {
            await applyPlanSelections(draftId, data.drafterId, selections);
            navigate(`/draft/${draftId}`);
        } finally {
            setApplying(false);
        }
    };

    const savePlanFromDraft = () => {
        const name = window.prompt("Name for the new plan (snapshot of this draft's drafted results):");
        if (!name) return;
        draftPlanCreate(draftId, { name }).then(() => refetchPlans());
    };

    const deletePlan = (planId: number) => {
        draftPlanDelete(planId).then(() => {
            if (selectedPlanId === planId) setSelectedPlanId(null);
            refetchPlans();
        });
    };

    if (!data.hydrated) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="bg-white rounded-lg shadow-md p-8 text-center">
                    <p className="text-gray-700 mb-4">No local data for this draft yet — open the board first so it loads.</p>
                    <Link className="inline-block bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md" to={`/draft/${draftId}`}>Go to the draft board</Link>
                </div>
            </div>
        );
    }

    const canApply = selectedPlan && !applying && rows.some(({ slot, disabled }) => !disabled && checkedSlots[slot]);

    return (
        <div className="min-h-screen bg-gray-100 py-8 px-4">
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">

                <div className="bg-green-200 px-6 py-4 flex items-center gap-4">
                    <button
                        className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50 active:bg-gray-100 shadow-sm"
                        onClick={() => navigate(`/draft/${draftId}`)}
                    >
                        ← Back to board
                    </button>
                    <div className="flex-1 text-center">
                        <h1 className="text-xl font-bold text-gray-800">Draft Plans</h1>
                        <p className="text-sm text-gray-600">{data.draftDetails?.draft_name || `Draft ${draftId}`}</p>
                    </div>
                    <span className="w-28" />
                </div>

                <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3 flex-wrap bg-gray-50">
                    <label className="text-sm font-semibold text-gray-700">Plan:</label>
                    <select
                        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-blue-500 min-w-48"
                        value={selectedPlanId ?? ""}
                        onChange={(e) => setSelectedPlanId(e.target.value ? Number(e.target.value) : null)}
                    >
                        <option value="">— select a plan —</option>
                        {plans?.map((plan) => (
                            <option key={plan.id} value={plan.id}>{plan.year} — {plan.name}</option>
                        ))}
                    </select>
                    {selectedPlan && (
                        <button
                            className="text-xs text-red-600 border border-red-200 rounded-md px-2 py-1 hover:bg-red-50"
                            title="Delete this plan"
                            onClick={() => deletePlan(selectedPlan.id)}
                        >Delete plan</button>
                    )}
                    <span className="flex-1" />
                    <button
                        className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white hover:bg-gray-50 shadow-sm"
                        title="Snapshot this draft's drafted results as a new plan"
                        onClick={savePlanFromDraft}
                    >＋ Save draft as plan</button>
                </div>

                {!selectedPlan && (
                    <p className="px-6 py-3 text-sm text-gray-500 bg-blue-50 border-b border-blue-100">
                        Select a plan to compare it against your current budget and pick which slots to merge in.
                    </p>
                )}

                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-200 text-gray-600 text-xs uppercase tracking-wide">
                            <th className="text-left px-6 py-2">Slot</th>
                            <th className="text-left px-3 py-2">Current budget</th>
                            <th className="text-left px-3 py-2">Plan</th>
                            <th className="px-6 py-2">Merge</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ slot, current, currentIsDrafted, planPlayer, planTakenBy, samePlayer, disabled }) => (
                            <tr key={slot} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-6 py-2 font-semibold text-gray-700">{slot}</td>
                                <td className="px-3 py-2">
                                    {current.player_id ? (
                                        <span className="inline-flex items-center gap-1.5">
                                            <span
                                                className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                                                style={{ background: POSITION_BG_COLORS[current.position], color: POSITION_FG_COLORS[current.position] }}
                                            >
                                                {current.player_name} · ${currentPrice(current)}
                                            </span>
                                            {currentIsDrafted && <span className="text-xs text-gray-500">🔒 drafted</span>}
                                        </span>
                                    ) : (
                                        <span className="text-gray-300">—</span>
                                    )}
                                </td>
                                <td className="px-3 py-2">
                                    {planPlayer ? (
                                        <span className="inline-flex items-center gap-1.5">
                                            <span
                                                className={"inline-block px-2 py-0.5 rounded-full text-xs font-semibold" + (disabled ? " opacity-50" : "")}
                                                style={{ background: POSITION_BG_COLORS[planPlayer.position], color: POSITION_FG_COLORS[planPlayer.position] }}
                                            >
                                                {planPlayer.name} · ${planPrice(planPlayer)}
                                            </span>
                                            {planTakenBy && <span className="text-xs text-gray-500">drafted by {planTakenBy}</span>}
                                            {samePlayer && !planTakenBy && <span className="text-xs text-gray-500">already budgeted here</span>}
                                        </span>
                                    ) : (
                                        <span className="text-gray-300">—</span>
                                    )}
                                </td>
                                <td className="px-6 py-2 text-center">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 accent-blue-600 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                                        disabled={disabled}
                                        checked={!!checkedSlots[slot]}
                                        onChange={() => toggleSlot(slot)}
                                        title={
                                            disabled
                                                ? "Nothing to merge for this slot"
                                                : currentIsDrafted
                                                    ? "Checking this overwrites the budget row of a player you already drafted"
                                                    : "Take the plan's player for this slot"
                                        }
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {selectedPlan && mergedSpent > startingBudget && (
                    <p className="px-6 py-2 bg-yellow-100 text-center text-sm font-semibold text-yellow-800">
                        ⚠️ Merged plan totals ${mergedSpent}, over the ${startingBudget} budget — uncheck some slots or adjust after applying.
                    </p>
                )}

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center gap-6">
                    <div className="text-sm text-gray-600">
                        <span className="font-semibold text-gray-800">Current:</span> ${data.budgetSpent} of ${startingBudget}
                    </div>
                    <div className="text-sm text-gray-600">
                        <span className="font-semibold text-gray-800">After merge:</span>{" "}
                        <span className={mergedSpent > startingBudget ? "text-red-600 font-bold" : ""}>${mergedSpent}</span> of ${startingBudget}
                    </div>
                    <span className="flex-1" />
                    <button
                        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-md px-5 py-2 shadow-sm disabled:opacity-40 disabled:hover:bg-blue-500"
                        disabled={!canApply}
                        onClick={applyPlan}
                    >
                        {applying ? "Applying…" : "Apply selected"}
                    </button>
                </div>

            </div>
        </div>
    );
}

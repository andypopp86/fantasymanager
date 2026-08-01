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
            <div className="p-4">
                <p>No local data for this draft yet — open the board first so it loads.</p>
                <Link className="text-blue-600 underline" to={`/draft/${draftId}`}>Go to the draft board</Link>
            </div>
        );
    }

    return (
        <>
        <div className="grid grid-cols-12 gap-4">
            <div className="col-span-2 flex gap-2">
                <button className={"btn border border-gray-400 rounded-md px-2 py-1 hover:bg-gray-100 active:bg-gray-200"} onClick={() => navigate(`/draft/${draftId}`)}>Back</button>
            </div>
            <div className="col-span-10">
                <p className="bg-green-200 text-center text-lg font-bold">Draft Plans — {data.draftDetails?.draft_name || `draft ${draftId}`}</p>
            </div>
        </div>

        <div className="max-w-3xl mx-auto mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm font-semibold">Plan:</label>
                <select
                    className="border border-gray-300 rounded px-2 py-1"
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
                        className="text-xs border border-gray-400 rounded px-1 py-0.5 hover:bg-red-100"
                        title="Delete this plan"
                        onClick={() => deletePlan(selectedPlan.id)}
                    >Delete plan</button>
                )}
                <span className="flex-1" />
                <button
                    className="btn border border-gray-400 rounded-md px-2 py-1 hover:bg-gray-100"
                    title="Snapshot this draft's drafted results as a new plan"
                    onClick={savePlanFromDraft}
                >Save draft as plan</button>
            </div>

            <table className="w-full text-sm">
                <thead>
                    <tr className="component-subheader">
                        <th className="text-left">Slot</th>
                        <th className="text-left">Current budget</th>
                        <th className="text-left">Plan</th>
                        <th>Merge</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ slot, current, currentIsDrafted, planPlayer, planTakenBy, samePlayer, disabled }) => (
                        <tr key={slot} className="border-b border-gray-200">
                            <td className="font-semibold">{slot}</td>
                            <td>
                                {current.player_id ? (
                                    <span
                                        className="px-1 rounded"
                                        style={{ background: POSITION_BG_COLORS[current.position], color: POSITION_FG_COLORS[current.position] }}
                                    >
                                        {current.player_name} (${currentPrice(current)})
                                        {currentIsDrafted && " 🔒 drafted"}
                                    </span>
                                ) : (
                                    <span className="text-gray-400">—</span>
                                )}
                            </td>
                            <td>
                                {planPlayer ? (
                                    <span
                                        className="px-1 rounded"
                                        style={{ background: POSITION_BG_COLORS[planPlayer.position], color: POSITION_FG_COLORS[planPlayer.position] }}
                                    >
                                        {planPlayer.name} (${planPrice(planPlayer)})
                                        {planTakenBy && ` — drafted by ${planTakenBy}`}
                                        {samePlayer && !planTakenBy && " — already budgeted here"}
                                    </span>
                                ) : (
                                    <span className="text-gray-400">—</span>
                                )}
                            </td>
                            <td className="text-center">
                                <input
                                    type="checkbox"
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
                    <tr className="bg-gray-100 font-semibold">
                        <td>Total</td>
                        <td>${data.budgetSpent} of ${startingBudget}</td>
                        <td>${mergedSpent} of ${startingBudget} after merge</td>
                        <td className="text-center">
                            <button
                                className="btn bg-blue-500 text-white rounded-md px-2 py-1 disabled:opacity-40"
                                disabled={!selectedPlan || applying || rows.every(({ slot, disabled }) => disabled || !checkedSlots[slot])}
                                onClick={applyPlan}
                            >
                                {applying ? "Applying…" : "Apply"}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
            {selectedPlan && mergedSpent > startingBudget && (
                <p className="bg-yellow-200 text-center text-sm font-semibold">
                    ⚠️ Merged plan totals ${mergedSpent}, over the ${startingBudget} budget — uncheck some slots or adjust after applying.
                </p>
            )}
        </div>
        </>
    );
}

import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { draftPlansRetrieve, draftPlanCreate, draftPlanDelete } from "../lib/data";
import { applyPlanToBoard } from "../lib/mutations";
import { useDraftData } from "../hooks/useDraftData";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import type { DraftPlanPlayer } from "../lib/draft.schemas";

const planPrice = (player: DraftPlanPlayer) =>
    parseInt(String(player.override_price ?? "")) || parseInt(String(player.projected_price)) || 1;

// /draft/:draftId/plan — swap a saved DraftPlan onto the board. Applying is
// WHOLESALE: the budget is emptied and the plan's roster takes its place, and
// the same for the backup shelves (authored on the mock draft this plan came
// from). There is no per-slot picking — a plan is applied or it isn't.
//
// The table is therefore a PREVIEW: current budget beside what the plan puts
// there, with players the field has already drafted called out so nothing lands
// silently. Backups crossing over is the only way a shelf reaches another
// browser; the board's own backups never leave Dexie.
export default function DraftPlanPage() {
    const { draftId: draftIdParam } = useParams();
    const draftId = Number(draftIdParam);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
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
    const [applying, setApplying] = useState(false);

    const selectedPlan = plans?.find((plan) => plan.id === selectedPlanId) || null;

    // player_id -> manager_name for every drafted player in this draft, purely
    // to LABEL the preview — who's already gone, and which budget rows mirror
    // your own picks. Nothing here blocks an apply.
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

    // One row per budget slot, in board order — a preview of what applying does.
    const rows = useMemo(() => {
        return Object.entries(data.budgetedPlayers).map(([slot, slotObj]: [string, any]) => {
            const current = slotObj.pick;
            const currentIsDrafted = !!current.player_id && draftedBy[String(current.player_id)] === drafterName;
            const planPlayer: DraftPlanPlayer | null = selectedPlan?.slots?.[slot] || null;
            const planTakenBy = planPlayer ? draftedBy[String(planPlayer.player_id)] : undefined;
            const planBackups = (selectedPlan?.backups?.[slot] || []).filter(Boolean) as DraftPlanPlayer[];
            return { slot, current, currentIsDrafted, planPlayer, planTakenBy, planBackups };
        });
    }, [data.budgetedPlayers, draftedBy, drafterName, selectedPlan]);

    // Budget preview: what's budgeted now vs. what the plan costs.
    const startingBudget = Number(data.draftDetails?.starting_budget ?? drafter?.manager_budget) || 0;
    const currentPrice = (current: any) =>
        parseInt(current.actual_price) || parseInt(current.projected_price) || 0;
    // The plan's total, not a blend: applying takes the whole roster.
    const planSpent = rows.reduce((acc, { planPlayer }) => acc + (planPlayer ? planPrice(planPlayer) : 0), 0);

    const applyPlan = async () => {
        if (!selectedPlan) return;
        const roster = rows
            .filter(({ planPlayer }) => !!planPlayer)
            .map(({ slot, planPlayer }) => ({
                slot,
                player: { player_id: planPlayer!.player_id, name: planPlayer!.name, position: planPlayer!.position },
                projectedPrice: planPrice(planPlayer!),
            }));
        const shelves = rows.map(({ slot }) => ({
            slot,
            cells: (selectedPlan.backups?.[slot] || [])
                .map((player, index) => ({ player, rank: index + 1 }))
                .filter(({ player }) => !!player)
                .map(({ player, rank }) => ({
                    rank,
                    player: { player_id: player!.player_id, name: player!.name, position: player!.position },
                    projectedPrice: planPrice(player!),
                })),
        }));
        setApplying(true);
        try {
            await applyPlanToBoard(draftId, data.drafterId, roster, shelves);
            // DROP the board's cached budget before going back. `Draft.tsx`
            // hydrates Dexie from whatever React Query already holds, and
            // `hydrateDraft` is a wholesale replace — so a pre-swap
            // `budgeted_picks` in the cache would overwrite the rows just
            // written and the plan would look like it never applied. Removing
            // it forces a fetch, and the hydrate effect sits out until that
            // lands. Only this one query: applying a plan moves budget rows
            // and nothing else, so drafted picks and availability are as they
            // were.
            queryClient.removeQueries({ queryKey: ["budgeted_picks", draftId] });
            navigate(`/draft/${draftId}`);
        } finally {
            setApplying(false);
        }
    };

    // year + name identifies a plan, so re-using a name replaces that plan —
    // the server answers 409 until the client confirms it. (A snapshot of a
    // draft carries no backups: the board's shelf never leaves the browser.)
    const savePlanFromDraft = () => {
        const name = window.prompt("Name for the new plan (snapshot of this draft's drafted results):");
        if (!name) return;
        const save = (overwrite: boolean): Promise<unknown> =>
            draftPlanCreate(draftId, { name, overwrite })
                .then(() => refetchPlans())
                .catch((err: any) => {
                    if (err?.response?.status === 409 && !overwrite
                        && window.confirm(`A ${data.draftDetails?.year || ""} plan named “${name}” already exists. Replace it?`)) {
                        return save(true);
                    }
                    if (err?.response?.status === 409) return undefined;
                    throw err;
                });
        save(false);
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

    const canApply = selectedPlan && !applying && rows.some(({ planPlayer }) => !!planPlayer);
    // Applying wipes the budget, so a drafted pick losing its budget row is the
    // one consequence worth spelling out before the click.
    const draftedRows = rows.filter(({ currentIsDrafted }) => currentIsDrafted);

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

                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center gap-6">
                    <div className="text-sm text-gray-600">
                        <span className="font-semibold text-gray-800">Current:</span> ${data.budgetSpent} of ${startingBudget}
                    </div>
                    <div className="text-sm text-gray-600">
                        <span className="font-semibold text-gray-800">This plan:</span>{" "}
                        <span className={planSpent > startingBudget ? "text-red-600 font-bold" : ""}>${planSpent}</span> of ${startingBudget}
                    </div>
                    <span className="flex-1" />
                    <button
                        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-md px-5 py-2 shadow-sm disabled:opacity-40 disabled:hover:bg-blue-500"
                        title="Empty the budget and the backup shelves, then install this plan"
                        disabled={!canApply}
                        onClick={applyPlan}
                    >
                        {applying ? "Applying…" : "Replace board with plan"}
                    </button>
                </div>

                {selectedPlan && planSpent > startingBudget && (
                    <p className="px-6 py-2 bg-yellow-100 text-center text-sm font-semibold text-yellow-800">
                        ⚠️ This plan totals ${planSpent}, over the ${startingBudget} budget — adjust after applying.
                    </p>
                )}

                {selectedPlan && draftedRows.length > 0 && (
                    <p className="px-6 py-2 bg-orange-100 text-center text-sm text-orange-900">
                        Applying empties the whole budget, including {draftedRows.length} row{draftedRows.length === 1 ? "" : "s"} holding a player you already drafted
                        ({draftedRows.map(({ current }) => current.player_name).join(", ")}). The picks stand; their budget rows don't.
                    </p>
                )}

                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-200 text-gray-600 text-xs uppercase tracking-wide">
                            <th className="text-left px-6 py-2">Slot</th>
                            <th className="text-left px-3 py-2">Current budget</th>
                            <th className="text-left px-3 py-2">Plan</th>
                            <th className="text-left px-3 py-2" title="Alternates saved with the plan; applying installs them on the board's shelves">Backups</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ slot, current, currentIsDrafted, planPlayer, planTakenBy, planBackups }) => (
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
                                                className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                                                style={{ background: POSITION_BG_COLORS[planPlayer.position], color: POSITION_FG_COLORS[planPlayer.position] }}
                                            >
                                                {planPlayer.name} · ${planPrice(planPlayer)}
                                            </span>
                                            {planTakenBy && <span className="text-xs text-gray-500">drafted by {planTakenBy}</span>}
                                        </span>
                                    ) : (
                                        <span className="text-gray-300">—</span>
                                    )}
                                </td>
                                <td className="px-3 py-2">
                                    {planBackups.length ? (
                                        <span className="flex flex-wrap gap-1">
                                            {planBackups.map((backup) => (
                                                <span
                                                    key={backup.player_id}
                                                    className="inline-block px-1.5 rounded text-xs"
                                                    style={{ background: POSITION_BG_COLORS[backup.position], color: POSITION_FG_COLORS[backup.position] }}
                                                    title={draftedBy[String(backup.player_id)] ? `Drafted by ${draftedBy[String(backup.player_id)]}` : `Backup for ${slot}`}
                                                >
                                                    {backup.name}
                                                </span>
                                            ))}
                                        </span>
                                    ) : (
                                        <span className="text-gray-300">—</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

            </div>
        </div>
    );
}

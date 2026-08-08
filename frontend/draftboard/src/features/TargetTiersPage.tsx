import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftRetrieve } from "../lib/data";
import { useDraftData } from "../hooks/useDraftData";
import TargetTiers from "./TargetTiers";
import BudgetFromTierModal from "./BudgetFromTierModal";

// /draft/:draftId/tiers — the target board on its own page (the full-width view
// of the same section that sits under the draft board). All the rendering lives
// in TargetTiers; this is page chrome plus the budget editor.
export default function TargetTiersPage() {
    const { draftId: draftIdParam } = useParams();
    const draftId = Number(draftIdParam);
    const navigate = useNavigate();
    const [budgetPlayer, setBudgetPlayer] = useState<any>(null);

    const { data: draftDetails } = useQuery({
        queryKey: ["draft_detail", draftIdParam],
        queryFn: () => draftRetrieve(draftIdParam),
        select: (response) => response.data,
    });

    // Budget editing needs the local rows, which only exist once the board has
    // been opened for this draft (same constraint as the plan page). Until then
    // the tiers still render — they come straight from the server — but the
    // cards stay inert rather than opening an editor over an empty budget.
    const data = useDraftData(draftId);
    const canBudget = data.hydrated && !!draftDetails;
    const draftContext = { ...data, draftId, draftDetails };

    return (
        <div className="min-h-screen bg-gray-100 py-4 px-2 sm:px-4">
            <div className="max-w-full mx-auto bg-white rounded-lg shadow-md overflow-hidden">

                <div className="bg-green-200 px-4 py-3 flex items-center gap-3 flex-wrap">
                    <button
                        className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50 active:bg-gray-100 shadow-sm"
                        onClick={() => navigate(`/draft/${draftId}`)}
                    >
                        ← Back to board
                    </button>
                    <div className="flex-1 text-center min-w-40">
                        <h1 className="text-xl font-bold text-gray-800">Target Tiers</h1>
                        <p className="text-sm text-gray-600">{draftDetails?.draft_name || `Draft ${draftId}`}</p>
                    </div>
                    <span className="w-28" />
                </div>

                {!canBudget && (
                    <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                        Open the draft board once to load this draft locally — then clicking a player here
                        opens the budget editor.
                    </p>
                )}

                <TargetTiers
                    draftId={draftId}
                    onPlayerClick={canBudget ? setBudgetPlayer : undefined}
                />
            </div>

            {budgetPlayer && canBudget && (
                <BudgetFromTierModal
                    player={budgetPlayer}
                    draftContext={draftContext}
                    onClose={() => setBudgetPlayer(null)}
                />
            )}
        </div>
    );
}

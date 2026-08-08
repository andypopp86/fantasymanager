import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftRetrieve } from "../lib/data";
import TargetTiers from "./TargetTiers";

// /draft/:draftId/tiers — the target board on its own page (the full-width view
// of the same section that sits under the draft board). All the rendering lives
// in TargetTiers; this is page chrome only.
export default function TargetTiersPage() {
    const { draftId: draftIdParam } = useParams();
    const draftId = Number(draftIdParam);
    const navigate = useNavigate();

    const { data: draftDetails } = useQuery({
        queryKey: ["draft_detail", draftIdParam],
        queryFn: () => draftRetrieve(draftIdParam),
        select: (response) => response.data,
    });

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

                <TargetTiers draftId={draftId} />
            </div>
        </div>
    );
}

import React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftRetrieve, draftManagerPicksRetrieve } from "../lib/data";
import { MANAGER_BG_COLORS, MANAGER_FG_COLORS, POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";

const POLL_MS = 5000;

// /board/:draftId — read-only draft board for a second screen (e.g. another
// laptop on the LAN during the live draft). Deliberately shows ONLY the board:
// no available players, budget plan, watchlist, or nomination, so the
// drafter's targeting stays private. Also deliberately reads straight from
// its polled queries instead of the Dexie pipeline — it's a passive viewer,
// usually on a different machine, and never writes.
export default function SpectatorBoard() {
    const { draftId: draftIdParam } = useParams();
    const draftId = Number(draftIdParam);

    const { data: draftDetails } = useQuery({
        queryKey: ["spectator_draft_detail", draftId],
        queryFn: () =>
            draftRetrieve(String(draftId)),
        refetchInterval: POLL_MS,
        select: (data) => {
            return data.data;
        }
    })

    const { data: managers } = useQuery({
        queryKey: ["spectator_manager_picks", draftId],
        queryFn: () =>
            draftManagerPicksRetrieve(draftId),
        refetchInterval: POLL_MS,
        staleTime: 0,
        select: (data) => {
            return data.data;
        }
    })

    if (!managers || managers.length === 0) {
        return <div className="p-6 text-center text-gray-500">Loading draft board…</div>;
    }

    const slotNames: string[] = Object.keys(managers[0].draft_picks || {});

    return (
        <div className="p-2">
            <p className="bg-green-200 text-center text-lg font-bold mb-2">
                {draftDetails?.draft_name || `Draft ${draftId}`}
            </p>
            <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `3rem repeat(${managers.length}, minmax(0, 1fr))` }}
            >
                <div className="border border-gray-300 rounded">
                    <div style={{ height: "3.5rem" }} />
                    <ul className="mt-1">
                        {slotNames.map((slot) => (
                            <li key={slot} className="draft-slot flex justify-center items-center font-semibold text-xs">
                                {slot.replace(/^BENCH(\d+)$/, "B$1")}
                            </li>
                        ))}
                    </ul>
                </div>
                {managers.map((manager, index) => (
                    <div key={manager.manager_id} className="border border-gray-300 rounded">
                        <div
                            className="text-lg text-center font-semibold font-small"
                            style={{ backgroundColor: MANAGER_BG_COLORS[manager.manager_position], color: MANAGER_FG_COLORS[manager.manager_position] }}
                        >
                            <h2>{manager.manager_name}</h2>
                            <p>${manager.manager_budget}</p>
                        </div>
                        <ul className="mt-1">
                            {slotNames.map((slot) => {
                                const pick = manager.draft_picks[slot]?.pick || {};
                                return (
                                    <li
                                        key={`${slot}-${index}`}
                                        className="draft-slot flex w-full justify-between border border-gray-300 font-small"
                                        style={{
                                            color: POSITION_FG_COLORS[pick.position],
                                            backgroundColor: POSITION_BG_COLORS[pick.position],
                                        }}
                                    >
                                        <span className="border-r border-gray-300 draft-pick-name w-80 h-full flex items-center justify-center">{pick.name}</span>
                                        <span className="draft-pick-price w-20 h-full flex items-center justify-center">{pick.price}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
}

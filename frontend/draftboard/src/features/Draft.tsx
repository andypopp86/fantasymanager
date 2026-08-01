import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftAvailablePlayersRetrieve, draftManagerPicksRetrieve, draftBudgetedPicksRetrieve, draftWatchedPicksRetrieve } from "../lib/data";
import { hydrateDraft } from "../lib/db";
import { DraftBoard } from "../features/DraftBoard";
import { AvailablePlayers } from "../features/AvailablePlayers";
import WatchedPlayers from "../features/WatchedPlayers";
import { useDraftState } from "../hooks/useDraftState";
import { useDraftData } from "../hooks/useDraftData";
import { BudgetedPicks } from "./BudgetedPicks";
import { NominationArea } from "./NominationArea";
import { BudgetPerSlot } from "./BudgetPerSlot";

type DraftProps = {
    draftDetails: any
};

// Data flow: React Query fetches → hydrateDraft replaces this draft's Dexie
// rows → useDraftData projects them live into the shapes components consume.
// The XState machine contributes only flow state (nomination, drag). If the
// server is unreachable, the queries fail but last session's rows are still
// in Dexie — the board keeps working, and queued writes surface via the
// waiting-to-sync counter in the title row.
export default function Draft({draftDetails}: DraftProps) {
    const navigate = useNavigate();
    // Hidden by default: just a button next to Back. Shown: the panel keeps
    // its usual place in the sidebar.
    const [showWatchList, setShowWatchList] = useState(false);
    const { data: playersData } = useQuery({
        queryKey: ["available_players", draftDetails.id],
        queryFn: () =>
            draftAvailablePlayersRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { data: managerPicks } = useQuery({
        queryKey: ["manager_picks", draftDetails.id],
        queryFn: () =>
            draftManagerPicksRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { data: budgetedPicks } = useQuery({
        queryKey: ["budgeted_picks", draftDetails.id],
        queryFn: () =>
            draftBudgetedPicksRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { data: watchedPlayers } = useQuery({
        queryKey: ["watch_picks", draftDetails.id],
        queryFn: () =>
            draftWatchedPicksRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { draftStateRef, flowContext } = useDraftState();
    const { send: draftSend } = draftStateRef;
    const data = useDraftData(draftDetails.id);

    // Fresh server data replaces this draft's local rows wholesale (the
    // server stays the source of truth whenever it's reachable).
    useEffect(() => {
        if (!draftDetails.id || !playersData || !managerPicks || !budgetedPicks || !watchedPlayers) return;
        hydrateDraft(draftDetails.id, {
            draftDetails,
            availablePlayers: playersData,
            managerPicks,
            budgetedPicks,
            watchedPlayers,
        }).catch((err) => console.error("Failed to hydrate draft data", err));
    }
    , [playersData, draftDetails.id, managerPicks, budgetedPicks, watchedPlayers]);

    // Switching drafts: abandon in-flight nomination/drag state.
    useEffect(() => {
        draftSend({ type: "reset_flow" });
    }, [draftDetails.id, draftSend]);

    const draftContext = {
        ...data,
        ...flowContext,
        draftId: draftDetails.id,
        draftDetails,
    };

  return (
    <>
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-3 sm:col-span-3 md:col-span-3 lg:col-span-3 xl:col-span-3 flex gap-2">
        <button className={"btn border border-gray-400 rounded-md px-2 py-1 hover:bg-gray-100 active:bg-gray-200"} onClick={() => navigate("/")}>Back</button>
        {!showWatchList && (
            <button
                className={"btn border border-gray-400 rounded-md px-2 py-1 hover:bg-gray-100 active:bg-gray-200"}
                onClick={() => setShowWatchList(true)}
                title="Show WatchList"
            >
                WatchList ▸
            </button>
        )}
        <button
            className={"btn border border-gray-400 rounded-md px-2 py-1 hover:bg-gray-100 active:bg-gray-200"}
            onClick={() => navigate(`/draft/${draftDetails.id}/plan`)}
            title="Merge a saved plan into the budget"
        >
            Plans
        </button>
      </div>
      <div className="col-span-9 sm:col-span-9 md:col-span-9 lg:col-span-9 xl:col-span-9 flex">
        {data.pendingWrites > 0 && (
            <p className="w-1/3 bg-orange-200 text-center text-sm font-semibold flex items-center justify-center">
                ⏳ {data.pendingWrites} change{data.pendingWrites === 1 ? "" : "s"} waiting to sync
            </p>
        )}
        <p className="flex-1 bg-green-200 text-center text-lg font-bold">{draftDetails.draft_name}</p>
      </div>
    </div>
    {data.hydrated && (
        <div className="draftboard-grid">
            <div className="draft-sidebar flex gap-2">
                <AvailablePlayers draftContext={draftContext} draftSend={draftSend} />
                {showWatchList && (
                    <WatchedPlayers draftContext={draftContext} draftSend={draftSend} onHide={() => setShowWatchList(false)} />
                )}
                <div className="flex flex-col gap-2">
                    <NominationArea draftContext={draftContext} draftSend={draftSend} />
                    <BudgetPerSlot draftContext={draftContext} />
                    <BudgetedPicks draftContext={draftContext} draftSend={draftSend} />
                </div>
            </div>
            <div className="draft-main">
                <DraftBoard draftContext={draftContext} draftSend={draftSend}/>
            </div>
        </div>
    )}
    </>
  )
}

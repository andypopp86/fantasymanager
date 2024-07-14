import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { draftAvailablePlayersRetrieve, draftManagerPicksRetrieve, draftBudgetedPicksRetrieve } from "../lib/data";
import { DraftBoard } from "../features/DraftBoard";
import { AvailablePlayers } from "../features/AvailablePlayers";
import WatchedPlayers from "../features/WatchedPlayers";
import { useDraftState } from "../hooks/useDraftState";
import { BudgetedPicks } from "./BudgetedPicks";

type DraftProps = {
    draftDetails: any
    send: any
};

export default function Draft({draftDetails, send}: DraftProps) {

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

    const { draftStateRef, currentState, draftContext } = useDraftState();
    const { send: draftSend } = draftStateRef;
    useEffect(() => {
        if (!draftDetails.id || !playersData || !managerPicks || !budgetedPicks) return;
        draftSend({
            type: 'draft_loaded',
            draftDetails: draftDetails,
            managers: managerPicks,
            undraftedPlayers: playersData,
            budgetedPicks: budgetedPicks
        });
    }
    , [playersData, draftDetails.id, managerPicks, budgetedPicks, draftSend]);

    

  return (
    <>
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-2 sm:col-span-2 md:col-span-2 lg:col-span-2 xl:col-span-2">
        <p className="bg-blue-200">Draft State: {currentState}</p>
      </div>
      <div className="col-span-10 sm:col-span-10 md:col-span-10 lg:col-span-10 xl:col-span-10">
        <p className="bg-green-200 text-center text-lg font-bold">{draftDetails.draft_name}</p>
      </div>
    </div>
    {draftContext && draftContext.draftId && (
        <div className="draftboard-grid">
            {playersData && managerPicks && (
                <>
                    <div className="draft-sidebar flex gap-2">
                        <AvailablePlayers draftContext={draftContext} draftSend={draftSend} />
                        <WatchedPlayers draftContext={draftContext} draftSend={draftSend} />
                        <BudgetedPicks draftContext={draftContext} draftSend={draftSend} />
                    </div>
                    <div className="draft-main">
                        <DraftBoard draftContext={draftContext} draftSend={draftSend}/>
                    </div>
                </>
            )}
        </div>
        
    )}
    </>
  )
}
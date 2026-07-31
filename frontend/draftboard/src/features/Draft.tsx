import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftAvailablePlayersRetrieve, draftManagerPicksRetrieve, draftBudgetedPicksRetrieve, draftWatchedPicksRetrieve } from "../lib/data";
import { loadDraftSnapshot } from "../lib/db";
import { DraftBoard } from "../features/DraftBoard";
import { AvailablePlayers } from "../features/AvailablePlayers";
import WatchedPlayers from "../features/WatchedPlayers";
import { useDraftState } from "../hooks/useDraftState";
import { BudgetedPicks } from "./BudgetedPicks";
import { NominationArea } from "./NominationArea";

type DraftProps = {
    draftDetails: any
};

export default function Draft({draftDetails}: DraftProps) {
    const navigate = useNavigate();
    const { data: playersData, isError: playersError } = useQuery({
        queryKey: ["available_players", draftDetails.id],
        queryFn: () =>
            draftAvailablePlayersRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { data: managerPicks, isError: managerPicksError } = useQuery({
        queryKey: ["manager_picks", draftDetails.id],
        queryFn: () =>
            draftManagerPicksRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { data: budgetedPicks, isError: budgetedPicksError } = useQuery({
        queryKey: ["budgeted_picks", draftDetails.id],
        queryFn: () =>
            draftBudgetedPicksRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { data: watchedPlayers, isError: watchedPlayersError } = useQuery({
        queryKey: ["watch_picks", draftDetails.id],
        queryFn: () =>
            draftWatchedPicksRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { draftStateRef, currentState, draftContext } = useDraftState();
    const { send: draftSend } = draftStateRef;
    useEffect(() => {
        if (!draftDetails.id || !playersData || !managerPicks || !budgetedPicks || !watchedPlayers) return;
        draftSend({
            type: 'draft_loaded',
            draftDetails: draftDetails,
            managers: managerPicks,
            undraftedPlayers: playersData,
            budgetedPicks: budgetedPicks,
            watchedPlayers: watchedPlayers,
        });
    }
    , [playersData, draftDetails.id, managerPicks, budgetedPicks, watchedPlayers, draftSend]);

    // Server unreachable (a load query exhausted its retries): fall back to the
    // local Dexie snapshot. The machine only accepts restore_draft while still
    // in loadingDraft, so a snapshot can never stomp a server-hydrated session.
    const anyLoadError = playersError || managerPicksError || budgetedPicksError || watchedPlayersError;
    useEffect(() => {
        if (!draftDetails.id || !anyLoadError) return;
        loadDraftSnapshot(draftDetails.id).then((snapshot) => {
            if (snapshot) {
                draftSend({ type: 'restore_draft', context: snapshot.context, savedAt: snapshot.savedAt });
            }
        });
    }, [anyLoadError, draftDetails.id, draftSend]);


  return (
    <>
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-2 sm:col-span-2 md:col-span-2 lg:col-span-2 xl:col-span-2">
        <button className={"btn border border-gray-400 rounded-md px-2 py-1 hover:bg-gray-100 active:bg-gray-200"} onClick={() => navigate("/")}>Back</button>
      </div>
      <div className="col-span-10 sm:col-span-10 md:col-span-10 lg:col-span-10 xl:col-span-10">
        <p className="bg-green-200 text-center text-lg font-bold">{draftDetails.draft_name}</p>
      </div>
    </div>
    {draftContext && draftContext.restoredFromSnapshot && (
        <p className="bg-yellow-200 text-center text-sm font-semibold">
            ⚠️ Server unreachable — showing local snapshot
            {draftContext.snapshotSavedAt && ` from ${new Date(draftContext.snapshotSavedAt).toLocaleString()}`}.
            Changes made now may not reach the server.
        </p>
    )}
    {draftContext && draftContext.draftId === draftDetails.id && (
        <div className="draftboard-grid">
            {((playersData && managerPicks) || draftContext.restoredFromSnapshot) && (
                <>
                    <div className="draft-sidebar flex gap-2">
                        <AvailablePlayers draftContext={draftContext} draftSend={draftSend} />
                        <WatchedPlayers draftContext={draftContext} draftSend={draftSend} />
                        <div className="flex flex-col gap-2">
                            <NominationArea draftContext={draftContext} draftSend={draftSend} />
                            <BudgetedPicks draftContext={draftContext} draftSend={draftSend} />
                        </div>
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
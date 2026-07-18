import React, {useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { draftListRetrieve } from "../lib/data";

import DraftList from "../features/DraftList";
import DraftCreate from "../features/DraftCreate";
import Draft from "../features/Draft";
import PlanChangesModal from "./PlanChangesModal";
import { useDraftAppState } from "../hooks/useDraftAppState";

export const DraftDashboard = () => {

    const { 
        selectedDraft,
        currentState,
        draftAppRef,
        appContext,
     } = useDraftAppState();
    
     const { send: appSend } = draftAppRef;
    
    const { data: draftListData } = useQuery({
        queryKey: ["draft_list"],
        queryFn: () =>
            draftListRetrieve(),
        select: (data) => {
            return data;
        }
    })

    useEffect(() => {
        if (draftListData?.data) {
            appSend({type: "drafts.loaded", draft_list: draftListData?.data})
        }
    }, [draftListData, appSend])

  const isDrafting = currentState === "drafting";
  const isCreating = currentState === "creating";

  return (
    <>
        <div>App State: {currentState}</div>
        {isDrafting ? (
            <>
            <button className={"btn"} onClick={() => appSend({type: "draft.back"})}>Back</button>
            <a 
                className={"btn bg-blue-500 text-white hover:bg-blue-700 active:bg-blue-900 rounded-md px-2 py-1"}
                href={`/draft/${selectedDraft.year}/player_stats/${selectedDraft.id}`}
                target="_blank"
            >Player Stats</a>
            <a 
                className={"btn bg-orange-500 text-white hover:bg-orange-700 active:bg-orange-900 rounded-md px-2 py-1 mx-2"}
                href={`/draft/${selectedDraft.id}/player_running_totals`}
                target="_blank"
            >Running Totals</a>
            {selectedDraft && <Draft draftDetails={selectedDraft} send={appSend} />}
            </>
        ) : isCreating ? (
            <>
            <button className={"btn"} onClick={() => appSend({type: "draft.back"})}>Back</button>
            <DraftCreate send={appSend} />
            </>
        ) : (
            <>
            <button className="flex-1 min-w-full text-center btn bg-green-500 text-white"
            onClick={() => appSend({ type: "go_to_create_draft" })}
            >
                Create Draft
            </button>
            <DraftList appContext={appContext} send={appSend} />

            </>
        )
    
    }
    </>
  );
  
}
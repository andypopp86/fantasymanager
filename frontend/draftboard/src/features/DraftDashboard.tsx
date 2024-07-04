import React, {useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { draftListRetrieve } from "../lib/data";

import DraftList from "../features/DraftList";
import Draft from "../features/Draft";
import { useDraftAppState } from "../hooks/useDraftAppState";

export const DraftDashboard = () => {

    const { 
        selectedDraftId,
        currentState,
        draftAppRef,
        contextSend
     } = useDraftAppState();

    
    const { data: draftListData } = useQuery({
        queryKey: ["draft_list"],
        queryFn: () =>
            draftListRetrieve(),
        select: (data) => {
            return data;
        }

    })

  const isDrafting = currentState === "drafting";

  return (
    <>
        <div>Current State: {currentState}</div>
        {isDrafting ? (
            <>
            <button className={"btn"} onClick={() => contextSend({type: "draft.back"})}>Back</button>
            {selectedDraftId && <Draft draftId={selectedDraftId} send={contextSend} />}
            </>
        ) : (
            <DraftList draft_list={draftListData?.data} send={contextSend} />
        )}
    </>
  );
  
}
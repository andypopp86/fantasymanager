import React, {useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { draftListRetrieve } from "../lib/data";

import DraftList from "../features/DraftList";
import Draft from "../features/Draft";
import { useDraftAppState } from "../hooks/useDraftAppState";

export const DraftDashboard = () => {

    const { 
        selectedDraft,
        currentState,
        draftAppRef,
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

  const isDrafting = currentState === "drafting";

  return (
    <>
        <div>App State: {currentState}</div>
        {isDrafting ? (
            <>
            <button className={"btn"} onClick={() => appSend({type: "draft.back"})}>Back</button>
            {selectedDraft && <Draft draftDetails={selectedDraft} send={appSend} />}
            </>
        ) : (
            <DraftList draft_list={draftListData?.data} send={appSend} />
        )}
    </>
  );
  
}
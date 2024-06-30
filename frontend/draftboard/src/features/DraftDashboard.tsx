import React, {HTMLProps, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { draftListRetrieve } from "../lib/data";
import { createActor, ActorRefFrom } from "xstate";

import DraftList from "../features/DraftList";
import Draft from "../features/Draft";
import { appStateMachine } from "../state_machines/appStateMachine";
import { useDraftAppState } from "../hooks/useDraftAppState";

export const DraftDashboard = () => {

    const { 
        selectedDraft,
        setSelectedDraft,
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
          <div>Drafting</div>

        </>
      ) : (
        <DraftList draft_list={draftListData?.data} send={contextSend} />
      )}
    </>
  );
  
}
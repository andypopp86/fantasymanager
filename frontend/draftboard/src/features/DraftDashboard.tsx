import React, {HTMLProps, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { draftListRetrieve } from "../lib/data";
import { createActor, ActorRefFrom } from "xstate";

import DraftList from "../features/DraftList";
import { appStateMachine } from "../state_machines/appStateMachine";
import { useDraftAppState } from "../hooks/useDraftAppState";

export const DraftDashboard = () => {
    // const { draft_id } = useQueryParams();
    // const draftAppRef = useRef(null);
    // let currentState = "";
    // if (draftAppRef.current) {
    //     console.log("DraftDashboard state", draftAppRef.current)
    //     currentState = draftAppRef.current.getSnapshot().value;
    // }
    // console.log("DraftDashboard state", currentState)
    const { 
        selectedDraft,
        setSelectedDraft,
        currentState,
        draftAppRef,
        contextSend
     } = useDraftAppState();
     console.log(contextSend)
    // useEffect(() => {

    //     draftAppRef.current = createActor(appStateMachine).start();
    //     console.log(draftAppRef)
    //     // console.log(draftAppActor.getSnapshot())

    //     // console.log(draftAppActor)
    //     // const state = draftAppActor.getSnapshot().value;
    //     // console.log(`DraftDashboard state: ${state}`)
    //     // const subscription = draftAppActor.subscribe((state) => {
    //     //     console.log(`DraftDashboard state: ${state}`)
    //     // });
    //     return () => {
    //         draftAppRef.current.stop();
    //     }
    //     // return () => {
    //     //     subscription.unsubscribe();
    //     //     draftAppActor.stop();
    //     // }
    // }, [appStateMachine])

    // const sendDraftSelected = (draft_id) => {
    //     console.log("Sending draft selected", draft_id)
    //     if (draftAppRef.current) {
    //         draftAppRef.current.send(
    //             { type: "draft.selected", draft_id: draft_id }
    //             )
    //         console.log("Sent draft selected", draft_id)
    //     }
    //     // draftAppActor.send(
    //     //     { type: "draft.selected", draft_id: draft_id }
    //     // )
    // }

    
    const { data: draftListData } = useQuery({
        queryKey: ["draft_list"],
        queryFn: () =>
            draftListRetrieve(),
        select: (data) => {
            console.log(data)
            return data;
        }

    })

  return (
    <>
    <div>Current State: {currentState}</div>
      <DraftList draft_list={draftListData?.data} send={contextSend} />
    </>
  )
}
import React, { ReactNode, lazy } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { draftManagersRetrieve, draftSlotsRetrieve } from "../lib/data";
import { useQueryParams } from "../hooks/useQueryParams";

import { DraftBoard } from "../features/DraftBoard";

export const Draft = () => {
    const { draft_id } = useQueryParams();
    const { data: managerData } = useQuery({
        queryKey: ["managers", draft_id],
        queryFn: () =>
            draftManagersRetrieve(draft_id | "45"),
        select: (data) => {
            return data;
        }

    })

    const { data: draftRoundData } = useQuery({
        queryKey: ["draft_rounds", draft_id],
        queryFn: () =>
            draftSlotsRetrieve(draft_id | "45"),
        select: (data) => {
            return data;
        }

    })
    // console.log(draftSlotData)
    // draftSlotData?.data.map((round) => {
    //     round.map((slot) => {
    //         console.log(slot) 
    //     })
    // })
    console.log(draftRoundData?.data)
  return (
    <>
      <div>Draft</div>
      <DraftBoard managers={managerData?.data} draft_rounds={draftRoundData?.data} />
    </>
  )
}
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { draftManagersRetrieve, draftSlotsRetrieve, draftPicksRetrieve } from "../lib/data";
import { useQueryParams } from "../hooks/useQueryParams";

import { DraftBoard } from "../features/DraftBoard";
import { AvailablePlayers } from "../features/AvailablePlayers";

export const Draft = () => {
    const { draft_id } = useQueryParams();
    console.log(draft_id)
    const { data: managerData } = useQuery({
        queryKey: ["managers", draft_id],
        queryFn: () =>
            draftManagersRetrieve(draft_id!),
        select: (data) => {
            return data;
        }
    })

    const { data: draftRoundData } = useQuery({
        queryKey: ["draft_rounds", draft_id],
        queryFn: () =>
            draftSlotsRetrieve(draft_id!),
        select: (data) => {
            return data;
        }
    })
    console.log(draftRoundData?.data.draft_rounds)
    const { data: picksData } = useQuery({
        queryKey: ["picks", draft_id],
        queryFn: () =>
            draftPicksRetrieve(draft_id!),
        select: (data) => {
            return data;
        }
    })
    // console.log(picksData)

  return (
    <>
        <Link to="/draft/react_draft_entrypoint/">Draft Dashboard</Link>
        <div className="draftboard-grid">
            <div className="">
                <AvailablePlayers />
            </div>
            <div>
                <DraftBoard
                    managers={managerData?.data!}
                    draft_rounds={draftRoundData?.data!} 
                />
            </div>
        </div>
    </>
  )
}
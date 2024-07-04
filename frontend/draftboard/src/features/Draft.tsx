import React from "react";
import { useQuery } from "@tanstack/react-query";
import { draftManagersRetrieve, draftSlotsRetrieve, draftPicksRetrieve, draftAvailablePlayersRetrieve } from "../lib/data";
import { DraftBoard } from "../features/DraftBoard";
import { AvailablePlayers } from "../features/AvailablePlayers";

type DraftProps = {
    draftId: string
    send: any
};

export default function Draft({draftId, send}: DraftProps) {
    
    const { data: managerData } = useQuery({
        queryKey: ["managers", draftId],
        queryFn: () =>
            draftManagersRetrieve(draftId!),
        select: (data) => {
            return data;
        }
    })

    const { data: draftRoundData } = useQuery({
        queryKey: ["draft_rounds", draftId],
        queryFn: () =>
            draftSlotsRetrieve(draftId!),
        select: (data) => {
            return data;
        }
    })
    // const { data: picksData } = useQuery({
    //     queryKey: ["picks", draftId],
    //     queryFn: () =>
    //         draftPicksRetrieve(draftId!),
    //     select: (data) => {
    //         return data;
    //     }
    // })

    const { data: playersData } = useQuery({
        queryKey: ["available_players", draftId],
        queryFn: () =>
            draftAvailablePlayersRetrieve(draftId),
        select: (data) => {
            return data.data;
        }
    })

  return (
    <>
        <div className="draftboard-grid">
            {playersData && managerData && draftRoundData && (
                <>
                <div className="">
                    <AvailablePlayers playersData={playersData} managers={managerData} />
                </div>
                <div>
                    <DraftBoard
                        managers={managerData?.data!}
                        draft_rounds={draftRoundData?.data!} 
                    />
                </div>
                </>
            )}
        </div>
    </>
  )
}
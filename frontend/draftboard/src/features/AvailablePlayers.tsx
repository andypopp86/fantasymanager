import React from "react";
import { useQuery } from "@tanstack/react-query";
import { draftAvailablePlayersRetrieve } from "../lib/data";
import AvailablePlayer from "./AvailablePlayer.tsx";


export const AvailablePlayers = ({selectedDraftId, send}) => {
    const { data: playersData } = useQuery({
        queryKey: ["picks", selectedDraftId],
        queryFn: () =>
            draftAvailablePlayersRetrieve(selectedDraftId!),
        select: (data) => {
            return data.data;
        }
    })

  return (
    <div>
        <div style={{fontSize: "24px", fontWeight: "bold"}}>Available Players</div>
        <table>
            <thead>
                <tr>
                    <th>Player Name</th>
                    <th>Position</th>
                </tr>
            </thead>
            <tbody>
                {playersData?.map((player) => (
                    <AvailablePlayer key={player.player.player_id} player={player} send={send} />
                ))}
            </tbody>
        </table>
    </div>
  )
}
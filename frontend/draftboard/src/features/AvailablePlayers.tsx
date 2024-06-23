import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { draftAvailablePlayersRetrieve } from "../lib/data";
import { useQueryParams } from "../hooks/useQueryParams";


export const AvailablePlayers = () => {
    const { draft_id } = useQueryParams();
    const { data: playersData } = useQuery({
        queryKey: ["picks", draft_id],
        queryFn: () =>
            draftAvailablePlayersRetrieve(draft_id!),
        select: (data) => {
            return data.data;
        }
    })
    console.log(playersData)

  return (
    <div>
        <h1>Available Players</h1>
        <table>
            <thead>
                <tr>
                    <th>Player Name</th>
                    <th>Position</th>
                </tr>
            </thead>
            <tbody>
                {playersData?.map((player) => (
                    <tr key={player.player.player_id}>
                        <td>{player.player.name}</td>
                        <td>{player.player.position}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
  )
}
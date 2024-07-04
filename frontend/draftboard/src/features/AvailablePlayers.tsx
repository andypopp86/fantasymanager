import React from "react";
import AvailablePlayer from "./AvailablePlayer.tsx";
import { useState, useRef } from "react";
import SubmitPick from "./SubmitPick.tsx";

export const AvailablePlayers = ({playersData, managers}) => {
    const [availablePlayers, setAvailablePlayers] = useState(playersData);
    const [nominatedPlayer, setNominatedPlayer] = useState(playersData[0].player);
    const [openDialog, setOpenDialog] = useState(false);

    return (
        <div>
            <div style={{fontSize: "24px", fontWeight: "bold"}}>Available Players</div>
            <table>
                <thead>
                    <tr>
                        <th>Player Name</th>
                        <th>Position</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
                    {availablePlayers?.map((player) => (
                        <AvailablePlayer key={player.player.player_id} player={player} setOpenDialog={setOpenDialog} setNominatedPlayer={setNominatedPlayer} />
                    ))}
                </tbody>
            </table>
            {openDialog && (
            <SubmitPick managers={managers.data} player={nominatedPlayer} openDialog={openDialog} setOpenDialog={setOpenDialog} />
            )}
        </div>
    )
}
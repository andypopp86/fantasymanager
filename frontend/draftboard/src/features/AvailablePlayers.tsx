import React from "react";
import AvailablePlayer from "./AvailablePlayer.tsx";
import { useState } from "react";
import SubmitPick from "./SubmitPick.tsx";

export const AvailablePlayers = ({draftContext, draftSend}) => {
    const [nominatedPlayer, setNominatedPlayer] = useState(draftContext.undraftedPlayers![0].player || null);
    const [openDialog, setOpenDialog] = useState(false);
    const handleDragStart = (e, id) => {
        draftSend({
            type: 'drag_player',
            player: draftContext.undraftedPlayers.find((player) => player.player.id === id),
        });
    }
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
                    {draftContext.undraftedPlayers?.map((player) => (
                        <AvailablePlayer
                            key={player.player.id}
                            player={player}
                            setOpenDialog={setOpenDialog}
                            setNominatedPlayer={setNominatedPlayer}
                            handleDragStart={handleDragStart}
                            id={player.player.id}
                        />
                    ))}
                </tbody>
            </table>
            {openDialog && (
            <SubmitPick
                draftContext={draftContext}
                player={nominatedPlayer}
                openDialog={openDialog}
                setOpenDialog={setOpenDialog}
                draftSend={draftSend}
            />
            )}
        </div>
    )
}
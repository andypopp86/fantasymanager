import React, { useState } from "react";
import WatchedPlayer from "./WatchedPlayer.tsx";
import { draftWatchPick } from "../lib/data";

export default function WatchedPlayers({draftContext, draftSend}) {
    const [isDragOver, setIsDragOver] = useState(false);
    const drafter = draftContext.managers.find((manager) => manager.is_drafter);
    const watchSum = draftContext.watchedPlayers?.reduce((acc, watchedPlayer) => {
        return acc + parseFloat(watchedPlayer.projected_price)}, 0);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };
    const handleDragLeave = () => setIsDragOver(false);

    // Drop an available player here to add them to the WatchList.
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const dragged = draftContext.draggedPlayer;
        if (!dragged || !dragged.player) return;
        const alreadyWatched = draftContext.watchedPlayers?.some(
            (w) => w.player_id === dragged.player.player_id
        );
        if (alreadyWatched) return;
        const watchedPlayer = {
            player_id: dragged.player.player_id,
            name: dragged.player.name,
            position: dragged.player.position,
            projected_price: dragged.projected_price,
        };
        draftWatchPick(draftContext.draftId, drafter.manager_id, dragged.player.player_id, { watch: true });
        draftSend({ type: "watch_player", player: watchedPlayer });
    };

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{ backgroundColor: isDragOver ? "#dbeafe" : undefined }}
        >
            <div className="component-header">WatchList</div>
            <table>
                <thead>
                    <tr className="component-subheader">
                        <th>Player Name</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="bg-gray-500 text-white font-small">
                        <td>Total</td>
                        <td>{watchSum}</td>
                    </tr>
                    {draftContext.watchedPlayers?.map((watchedPlayer) => (
                        <WatchedPlayer
                            key={watchedPlayer.player_id}
                            watchedPlayer={watchedPlayer}
                            draftSend={draftSend}
                            draftId={draftContext.draftId}
                            managerId={drafter.manager_id}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    )
}
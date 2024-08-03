import React from "react";
import WatchedPlayer from "./WatchedPlayer.tsx";

export default function WatchedPlayers({draftContext, draftSend}) {
    const drafter = draftContext.managers.find((manager) => manager.is_drafter);
    const watchSum = draftContext.watchedPlayers?.reduce((acc, watchedPlayer) => {
        return acc + parseFloat(watchedPlayer.player.projected_price)}, 0);
    return (
        <div>
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
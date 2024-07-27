import React from "react";
import WatchedPlayer from "./WatchedPlayer.tsx";

export default function WatchedPlayers({draftContext, draftSend}) {
    const watchSum = draftContext.watchedPlayers?.reduce((acc, player) => acc + parseFloat(player.projected_price), 0);
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
                    {draftContext.watchedPlayers?.map((player) => (
                        <WatchedPlayer
                            key={player.id}
                            player={player}
                            draftSend={draftSend}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    )
}
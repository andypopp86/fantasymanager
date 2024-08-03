import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import { draftWatchPick } from "../lib/data";


export default function WatchedPlayer({ watchedPlayer, draftSend, draftId, managerId }) {
    const player = watchedPlayer.player;
    const unwatchPlayer = (player) => {
        draftWatchPick(draftId, managerId, player.player_id, {watch: false});
        draftSend({type: 'unwatch_player', player: player});
    }
    return (
        <>
        {player && (
        <tr key={player.player_id} className="font-small" style={
            {background: POSITION_BG_COLORS[player.position], color: POSITION_FG_COLORS[player.position]}
            } onClick={() => unwatchPlayer(player)}>
            <td>{player.name}</td>
            <td>{player.projected_price}</td>
        </tr>
        )}
        
        </>
    )
}
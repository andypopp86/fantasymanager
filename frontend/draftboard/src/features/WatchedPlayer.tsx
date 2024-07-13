import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";


export default function WatchedPlayer({ player, draftSend }) {
    const unwatchPlayer = (player) => {
        draftSend({type: 'unwatch_player', player: player});
    }
    return (
        <tr key={player.player_id} className="font-small" style={
            {background: POSITION_BG_COLORS[player.position], color: POSITION_FG_COLORS[player.position]}
            } onClick={() => unwatchPlayer(player)}>
            <td>{player.name}</td>
            <td>{player.projected_price}</td>
        </tr>
    )
}
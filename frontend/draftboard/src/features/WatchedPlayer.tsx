import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import { draftWatchPick } from "../lib/data";


export default function WatchedPlayer({ watchedPlayer, draftSend, draftId, managerId }) {
    const unwatchPlayer = (watchedPlayer) => {
        draftWatchPick(draftId, managerId, watchedPlayer.player_id, {watch: false});
        draftSend({type: 'unwatch_player', player: watchedPlayer});
    }
    return (
        <>
        {watchedPlayer && (
        <tr key={watchedPlayer.player_id} className="font-small" style={
            {background: POSITION_BG_COLORS[watchedPlayer.position], color: POSITION_FG_COLORS[watchedPlayer.position]}
            } onClick={() => unwatchPlayer(watchedPlayer)}>
            <td>{watchedPlayer.name}</td>
            <td>{watchedPlayer.projected_price}</td>
        </tr>
        )}
        
        </>
    )
}
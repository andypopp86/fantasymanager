import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import { unwatchPick } from "../lib/mutations";


export default function WatchedPlayer({ watchedPlayer, draftSend, draftId, managerId }) {
    const unwatchPlayer = (watchedPlayer) => {
        unwatchPick(draftId, managerId, watchedPlayer.player_id);
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
import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";




export default function AvailablePlayer({player, setOpenDialog, setNominatedPlayer, handleDragStart, id }) {
    function nominatePlayer (player) {
        setNominatedPlayer(player);
        setOpenDialog(true);
    }
    const handleDrag = (e) => {
        e.preventDefault();
    };
    return (
        <tr key={player.player.player_id} className="font-small" style={
            {background: POSITION_BG_COLORS[player.player.position], color: POSITION_FG_COLORS[player.player.position]}
            } onClick={() => nominatePlayer(player.player)}
            draggable="true" onDrag={handleDrag} onDragStart={(e) => handleDragStart(e, id)}
            >
            <td>{player.player.name}</td>
            <td>{player.player.position}</td>
            <td>{player.player.projected_price}</td>
        </tr>
    )
}
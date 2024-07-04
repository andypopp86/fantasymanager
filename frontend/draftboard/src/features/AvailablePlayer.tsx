import React from "react";
import { useRef } from "react";

const POSITION_BG_COLORS = {
    "RB": "blue",
    "WR": "green",
    "QB": "red",
    "TE": "orange",
    "DEF": "brown",
}
const POSITION_FG_COLORS = {
    "RB": "white",
    "WR": "white",
    "QB": "white",
    "TE": "white",
    "DEF": "white",
}


export default function AvailablePlayer({player, setOpenDialog, setNominatedPlayer }) {
    function nominatePlayer (player) {
        setNominatedPlayer(player);
        setOpenDialog(true);
    }
    return (
        <tr key={player.player.player_id} style={
            {background: POSITION_BG_COLORS[player.player.position], color: POSITION_FG_COLORS[player.player.position]}
            } onClick={() => nominatePlayer(player.player)}>
            <td>{player.player.name}</td>
            <td>{player.player.position}</td>
            <td>{player.player.projected_price}</td>
        </tr>
    )
}
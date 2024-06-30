import React from "react";

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

export default function AvailablePlayer ({player, send}) {

  return (
    <tr key={player.player.player_id} style={
        {background: POSITION_BG_COLORS[player.player.position], color: POSITION_FG_COLORS[player.player.position]}
        } onClick={() => {
            send({
                type: "draft.player",
                id: player.player.player_id,
            })
        }}>
        <td>{player.player.name}</td>
        <td>{player.player.position}</td>
    </tr>
  )
}
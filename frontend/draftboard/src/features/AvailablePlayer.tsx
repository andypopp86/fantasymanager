import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";


export default function AvailablePlayer({pick, setOpenDialog, setNominatedPlayer, handleDragStart, id }) {
    function nominatePlayer (pick) {
        setNominatedPlayer(pick);
        setOpenDialog(true);
    }
    const handleDrag = (e) => {
        e.preventDefault();
    };
    const getStrengthOfSchedule = (pick) => {
        const fieldName = `early_season_${pick.player.position.toLowerCase()}`;
        if (pick.player.team) {
            return pick.player.team[fieldName];
        }
        return 1000;
    }
    const strengthOfSchedule = getStrengthOfSchedule(pick);
    const scheduleBG = strengthOfSchedule > 25 ? "bg-red-900" : strengthOfSchedule <= 5 ? "bg-green-900" : "bg-white";
    const scheduleFG = strengthOfSchedule > 25 ? "text-white" : strengthOfSchedule <= 5 ? "text-white" : "text-black";
    return (
        <>
        {pick && (
            <tr key={pick.player.player_id} className="font-small" style={
                {background: POSITION_BG_COLORS[pick.player.position], color: POSITION_FG_COLORS[pick.player.position]}
                } onClick={() => nominatePlayer(pick.player)}
                draggable="true" onDrag={handleDrag} onDragStart={(e) => handleDragStart(e, id)}
                >
                <td>{pick.player.name}</td>
                <td>{pick.player.position}</td>
                <td>{pick.player.projected_price}</td>
                <td className={scheduleBG + " " + scheduleFG}
                    >{strengthOfSchedule}
                </td>
            </tr>
        )}
        </>
    )
}
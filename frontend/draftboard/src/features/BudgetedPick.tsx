import React from "react";
import { useState } from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";

export default function BudgetedPick({ positionSlot, pick, handleDrop, draftSend }) {
    const unbudgetPick = (pick) => {
        console.log("unbudgeting pick", pick)
    }
    const [isDragOver, setIsDragOver] = useState(false);
    const handleDragOver = (e) => { 
        e.preventDefault();
        setIsDragOver(true);
        draftSend({
            type: 'budget_slot_targeted',
            positionSlot: positionSlot
        });
    }
    const handleDragLeave = () => {
        setIsDragOver(false);
    }
    return (
        <tr key={pick.player_id} className="font-small" style={
            {
                background: isDragOver ? "blue" : POSITION_BG_COLORS[positionSlot],
                color: POSITION_FG_COLORS[positionSlot]}
            } onClick={() => unbudgetPick(pick.player_id)} 
            onDrop={(e) => {handleDrop(e); setIsDragOver(false)}}
            onDragOver={(e) => handleDragOver(e)}
            onDragLeave={handleDragLeave}
            >
            <td>{pick.player_name}</td>
            <td>{positionSlot}</td>
            <td>{pick.projected_price}</td>
        </tr>
    )
}
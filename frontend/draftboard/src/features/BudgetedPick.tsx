import React from "react";
import { useState } from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";

import { draftUnbudgetPick } from "../lib/data";

export default function BudgetedPick({ positionSlot, pick, handleDrop, draftSend, draftContext }) {
    
    const unbudgetPick = (draftId, drafterId, playerId) => {
        if (pick.player_id) {
            draftSend({
                type: 'unbudget_player',
                positionSlot: positionSlot,
            });
            draftUnbudgetPick(draftId, drafterId, playerId);
        }
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
        <tr key={pick.player_id} className="font-small border border-gray" style={
            {
                background: isDragOver ? "blue" : POSITION_BG_COLORS[positionSlot],
                color: POSITION_FG_COLORS[positionSlot]}
            } onClick={() => unbudgetPick(draftContext.draftId, draftContext.drafterId, pick.player_id)} 
            onDrop={(e) => {handleDrop(e); setIsDragOver(false)}}
            onDragOver={(e) => handleDragOver(e)}
            onDragLeave={handleDragLeave}
            >
            <td>{pick.player_name}</td>
            <td>{positionSlot}</td>
            <td>{pick.actual_price || pick.projected_price}</td>
        </tr>
    )
}
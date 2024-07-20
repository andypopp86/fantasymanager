import React from "react";
import { useState } from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";

import { draftUnbudgetPick } from "../lib/data";

export default function BudgetedPick({ positionSlot, pickSlot, handleDrop, draftSend, draftContext }) {
    
    const unbudgetPick = (draftId, drafterId, playerId) => {
        if (pickSlot.pick.player_id) {
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
        <tr key={pickSlot.pick.player_id} className="font-small border border-gray" style={
            {
                background: isDragOver ? "blue" : POSITION_BG_COLORS[positionSlot],
                color: POSITION_FG_COLORS[positionSlot]}
            } onClick={() => unbudgetPick(draftContext.draftId, draftContext.drafterId, pickSlot.pick.player_id)} 
            onDrop={(e) => {handleDrop(e); setIsDragOver(false)}}
            onDragOver={(e) => handleDragOver(e)}
            onDragLeave={handleDragLeave}
            >
            <td>{pickSlot.pick.player_name}</td>
            <td>{positionSlot}</td>
            <td>{pickSlot.pick.actual_price || pickSlot.pick.projected_price}</td>
        </tr>
    )
}
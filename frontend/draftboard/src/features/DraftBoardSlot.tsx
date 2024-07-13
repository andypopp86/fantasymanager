import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import { useState } from "react";

import { draftPickUnsubmit } from "../lib/data";

type DraftBoardSlotProps = {
    row: number;
    column: number;
    pick: any;
    manager: any;
    draftContext: any,
    draftSend: any;
    handleDrop: (e) => void;
};

export const DraftBoardSlot = ({
    row,
    column,
    pick,
    manager,
    draftContext,
    draftSend,
    handleDrop,
}: DraftBoardSlotProps) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const handleDragOver = (e) => { 
        e.preventDefault();
        setIsDragOver(true);
    }
    const handleDragLeave = () => {
        setIsDragOver(false);
    }

    const unsubmitPick = async (draftId: number, managerId: number, pick: any) => {
        if (!draftId || !managerId || !pick) {
            return;
        }
        await draftPickUnsubmit(draftId, managerId, pick.player_id);
        draftSend({
            type: 'undraft_player',
            draftId: draftId,
            managerId: managerId,
            pick: pick
        });
    }
    const uniqueKey = `${column}-${row}`;
    return (
        <li key={uniqueKey} className="flex justify-between border border-gray-300 font-small hover:bg-blue-700" style={{
            color: POSITION_FG_COLORS[pick.position],
            backgroundColor: isDragOver ? "blue" : POSITION_BG_COLORS[pick.position],
        }} onClick={() => unsubmitPick(draftContext.draftId, manager.manager_id, pick)}
        onDragOver={handleDragOver} onDrop={(e) => handleDrop(e)} onDragLeave={handleDragLeave}
        >
        <span className={"border border-gray-300 draft-pick-name"}>{pick.name}</span>
        <span className={"border border-gray-300 draft-pick-price"}>${pick.price}</span>
        </li>
    )
}
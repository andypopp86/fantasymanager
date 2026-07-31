import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import { useState } from "react";

import { unsubmitPick } from "../lib/mutations";

type DraftBoardSlotProps = {
    positionSlot: string;
    column: number;
    pickSlot: any;
    manager: any;
    draftContext: any,
    draftSend: any;
    handleDrop: (e) => void;
};

export const DraftBoardSlot = ({
    positionSlot,
    column,
    pickSlot,
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

    const undraftPick = async (draftId: number, manager: any, pick: any) => {
        if (!draftId || !manager.manager_id || !pick.player_id) {
            return;
        }
        await unsubmitPick(draftId, manager.manager_id, pick.player_id);
    }
    const uniqueKey = `${positionSlot}-${column}`;
    return (
        <>
        {pickSlot && positionSlot.length > 0 && column != undefined  && (
            <li key={uniqueKey} className="draft-slot flex w-full justify-between border border-gray-300 font-small hover:bg-blue-700" style={{
                color: POSITION_FG_COLORS[pickSlot.pick.position],
                backgroundColor: isDragOver ? "blue" : POSITION_BG_COLORS[pickSlot.pick.position],
            }} onClick={() => undraftPick(draftContext.draftId, manager, pickSlot.pick)}
            onDragOver={handleDragOver} onDrop={(e) => { handleDrop(e, positionSlot, manager); setIsDragOver(false); }} onDragLeave={handleDragLeave}
            >
                <span className={"border-r border-gray-300 draft-pick-name w-80 h-full flex items-center justify-center"}>{pickSlot.pick.name}</span>
                <span className={"border-r border-gray-300 draft-pick-price w-20 h-full flex items-center justify-center"}>{pickSlot.pick.price}</span>
            </li>

        )}
        </>
    )
}
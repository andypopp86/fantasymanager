import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import { useState } from "react";

import { draftPickUnsubmit } from "../lib/data";
import { findBudgetedPositionSlotByPlayerId } from "../utils/draftHelpers";

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

    const unsubmitPick = async (draftId: number, manager: any, pick: any) => {
        if (!draftId || !manager.manager_id || !pick) {
            return;
        }
        const players = manager.is_drafter ? draftContext.budgetedPlayers : manager.draft_picks;
        const positionSlot = findBudgetedPositionSlotByPlayerId(players, pickSlot.pick.player_id);
        draftSend({
            type: 'undraft_player',
            positionSlot: positionSlot,
            player_id: pickSlot.pick.player_id,
            player_name: pickSlot.pick.name,
            price: 0,
            draftId: draftId,
            managerId: manager.manager_id,
            pickSlot: pickSlot
        });
        await draftPickUnsubmit(draftId, manager.manager_id, pickSlot.pick.player_id);
    }
    const uniqueKey = `${positionSlot}-${column}`;
    return (
        <>
        {pickSlot && positionSlot.length > 0 && column != undefined  && (
            <li key={uniqueKey} className="flex w-full justify-between border border-gray-300 font-small hover:bg-blue-700" style={{
                color: POSITION_FG_COLORS[pickSlot.pick.position],
                backgroundColor: isDragOver ? "blue" : POSITION_BG_COLORS[pickSlot.pick.position],
            }} onClick={() => unsubmitPick(draftContext.draftId, manager, pickSlot.pick)}
            onDragOver={handleDragOver} onDrop={(e) => handleDrop(e)} onDragLeave={handleDragLeave}
            >
                <span className={"border border-gray-300 draft-pick-name w-80"}>{pickSlot.pick.name}</span>
                <span className={"border border-gray-300 draft-pick-price w-20"}>{pickSlot.pick.price}</span>
            </li>

        )}
        </>
    )
}
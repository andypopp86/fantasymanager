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
    placeNomination: (positionSlot: string, manager: any) => void;
};

export const DraftBoardSlot = ({
    positionSlot,
    column,
    pickSlot,
    manager,
    draftContext,
    draftSend,
    handleDrop,
    placeNomination,
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

    // Touch devices never fire drag events, so a tap does the same thing the
    // drop would: fill an empty slot with whoever's on the block. Filled slots
    // keep their existing meaning (tap to undraft).
    const nominated = draftContext.nominatedPlayer;
    const hasNomination = !!(nominated && nominated.player_id);
    const isEmpty = !pickSlot.pick.player_id;
    const isTapTarget = isEmpty && hasNomination
        && !!pickSlot.allowed_positions?.includes(nominated.position);

    const handleClick = () => {
        if (isEmpty) {
            if (hasNomination) placeNomination(positionSlot, manager);
            return;
        }
        undraftPick(draftContext.draftId, manager, pickSlot.pick);
    }
    const uniqueKey = `${positionSlot}-${column}`;
    return (
        <>
        {pickSlot && positionSlot.length > 0 && column != undefined  && (
            <li key={uniqueKey} className={"draft-slot flex w-full justify-between border border-gray-300 font-small hover:bg-blue-700"
                + (isTapTarget ? " ring-2 ring-inset ring-blue-500" : "")} style={{
                color: POSITION_FG_COLORS[pickSlot.pick.position],
                backgroundColor: isDragOver ? "blue" : POSITION_BG_COLORS[pickSlot.pick.position],
            }} onClick={handleClick}
            title={isTapTarget ? `Draft ${nominated.name} here for $${draftContext.nominationPrice}` : undefined}
            onDragOver={handleDragOver} onDrop={(e) => { handleDrop(e, positionSlot, manager); setIsDragOver(false); }} onDragLeave={handleDragLeave}
            >
                <span className={"border-r border-gray-300 draft-pick-name flex-1 min-w-0 truncate px-1 text-center"}>{pickSlot.pick.name}</span>
                <span className={"border-r border-gray-300 draft-pick-price w-10 shrink-0 text-center"}>{pickSlot.pick.price}</span>
            </li>

        )}
        </>
    )
}
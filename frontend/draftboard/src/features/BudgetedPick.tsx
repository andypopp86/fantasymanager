import React from "react";
import { useState } from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";

import * as mutations from "../lib/mutations";

export default function BudgetedPick({ positionSlot, pickSlot, handleDrop, draftSend, draftContext }) {

    const unbudgetPick = (draftId, drafterId, playerId) => {
        if (pickSlot.pick.player_id) {
            mutations.unbudgetPick(draftId, drafterId, playerId);
        }
    }

    // Tap equivalent of dropping a player here (touch fires no drag events):
    // an empty slot takes whoever is on the block, a filled one still clears.
    const nominated = draftContext.nominatedPlayer;
    const hasNomination = !!(nominated && nominated.player_id);
    const isEmpty = !pickSlot.pick.player_id;
    const isTapTarget = isEmpty && hasNomination
        && !!pickSlot.allowed_positions?.includes(nominated.position);

    const handleClick = () => {
        if (!isEmpty) {
            unbudgetPick(draftContext.draftId, draftContext.drafterId, pickSlot.pick.player_id);
            return;
        }
        if (!hasNomination) return;
        if (!isTapTarget) {
            alert(`${nominated.position} is not eligible for ${positionSlot}.`);
            return;
        }
        // Budgets are planned at the projected price, matching the drop path;
        // the nomination's live winning price only applies to actual picks.
        mutations.budgetPick(
            draftContext.draftId,
            draftContext.drafterId,
            nominated,
            positionSlot,
            nominated.projected_price ?? draftContext.nominationPrice,
        );
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
    const drafter = draftContext.managers.find(manager => manager.manager_id === draftContext.drafterId);
    const drafterPlayerIds = Object.values(drafter.draft_picks || {}).map(pick => pick.pick.player_id);
    const playerHasBeenDraftedByManagerBGColor = (pickSlot, drafterPlayerIds) => {
        if (pickSlot.pick.player_id === "") {
            return "white";
        }
        return drafterPlayerIds.includes(pickSlot.pick.player_id) ? "yellow" : "white";
    }
    return (
        <tr key={pickSlot.pick.player_id} className="font-small border border-gray" style={
            {
                // Rows can't carry a ring/outline reliably, so an open slot the
                // nominated player fits gets a blue tint instead.
                background: isDragOver ? "blue"
                    : isTapTarget ? "#dbeafe"
                    : playerHasBeenDraftedByManagerBGColor(pickSlot, drafterPlayerIds),
                color: POSITION_FG_COLORS[positionSlot]}
            } onClick={handleClick}
            title={isTapTarget ? `Budget ${nominated.name} at ${positionSlot}` : undefined}
            onDrop={(e) => {handleDrop(e); setIsDragOver(false)}}
            onDragOver={(e) => handleDragOver(e)}
            onDragLeave={handleDragLeave}
            >
            <td>{pickSlot.pick.player_name}</td>
            <td>{positionSlot}</td>
            <td>{parseInt(pickSlot.pick.actual_price || pickSlot.pick.projected_price)}</td>
        </tr>
    )
}
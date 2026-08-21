import React from "react";
import { useState } from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";

import * as mutations from "../lib/mutations";
import BackupCell from "./BackupCell";
import { BACKUP_DEPTH } from "../lib/draft.schemas";

export default function BudgetedPick({
    positionSlot, pickSlot, handleDrop, draftSend, draftContext,
    // The slot's shelf of alternates — BACKUP_DEPTH cells rendered as extra
    // columns on this row. `takenBy` is computed once by the parent (it needs
    // every manager's picks) rather than per row.
    backups = [], takenBy = {}, backupsExpanded = false,
}) {

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
    // A budget row mirroring one of the DRAFTER's own picks is settled: nothing
    // in this table can undo a pick, so a backup must not be promoted over it
    // (it would leave the pick standing with no budget row). Keyed on the
    // PLAYER, like the staging modal's locks — the row may have been re-slotted
    // away from the pick's slot.
    const settled = !!pickSlot.pick.player_id
        && drafterPlayerIds.some((playerId) => String(playerId) === String(pickSlot.pick.player_id));

    const ranks = Array.from({ length: BACKUP_DEPTH }, (_, index) => index + 1);

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
            {ranks.map((rank) => (
                <BackupCell
                    key={rank}
                    draftId={draftContext.draftId}
                    drafterId={draftContext.drafterId}
                    slot={positionSlot}
                    rank={rank}
                    cell={backups[rank - 1] || null}
                    allowed={pickSlot.allowed_positions || []}
                    occupantPick={pickSlot.pick}
                    settled={settled}
                    nominated={draftContext.nominatedPlayer}
                    draggedPlayer={draftContext.draggedPlayer}
                    expanded={backupsExpanded}
                    takenBy={takenBy}
                />
            ))}
        </tr>
    )
}
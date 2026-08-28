import React, { useMemo } from "react";
import BudgetedPick from "./BudgetedPick.tsx";
import * as mutations from "../lib/mutations";
import { autoSlotAssignments } from "../utils/reordering";
import { BACKUP_DEPTH } from "../lib/draft.schemas";

// The budget plan, one row per slot — plus each slot's BACKUP cells as extra
// columns on the right (features/BackupCell.tsx). The backups live here rather
// than in a panel of their own because a shelf only means anything beside the
// slot it backs up: "someone took my WR1 target, who replaces them" is one row,
// not two components to read across.
export const BudgetedPicks = ({draftContext, draftSend, backupsShown = false, onToggleBackups}) => {
    // Auto-slot the budgeted roster by price/position.
    const shuffleBudget = () => {
        const players = Object.values(draftContext.budgetedPlayers || {})
            .map((slot: any) => slot.pick)
            .filter((pick: any) => pick.player_id)
            .map((pick: any) => ({
                player_id: pick.player_id,
                position: pick.position,
                price: Number(pick.actual_price || pick.projected_price),
            }));
        const assignments = autoSlotAssignments(players);
        mutations.reslotBudget(draftContext.draftId, draftContext.drafterId, assignments);
    };

    // Who holds every drafted player, for the backup cells: a backup whose
    // player got taken is struck through and named with its taker instead of
    // silently sitting there. Read from the LOCAL manager projections, so a pick
    // made this session counts at once. Computed once here, not per row.
    const takenBy = useMemo(() => {
        const map = {};
        (draftContext.managers || []).forEach((manager) => {
            Object.values(manager.draft_picks || {}).forEach((pickSlot) => {
                if (pickSlot.pick.player_id) map[String(pickSlot.pick.player_id)] = manager.manager_name;
            });
        });
        return map;
    }, [draftContext.managers]);

    // The drafter's own picks, for the settled check below.
    const drafterPlayerIds = useMemo(() => {
        const drafter = (draftContext.managers || []).find(
            (manager) => manager.manager_id === draftContext.drafterId);
        return new Set(Object.values(drafter?.draft_picks || {})
            .map((pickSlot: any) => String(pickSlot.pick.player_id))
            .filter((playerId) => playerId && playerId !== "undefined"));
    }, [draftContext.managers, draftContext.drafterId]);

    // Dropping on a budget row. Two sources land here, told apart by `origin`,
    // which only a BackupCell sets (features/BackupCell.tsx):
    //   - a player from the list/nomination -> budget them, if the slot is open
    //   - a player off a backup shelf -> PROMOTE them into this slot, and hand
    //     whoever held it back to the cell they came from
    // Promotion is the whole reason the shelf exists, and dragging is now its
    // only trigger — the cells no longer promote on click.
    const handleDrop = (e) => {
        const targetSlot = draftContext.budgetSlotTargeted
        const budgetSlots = draftContext.budgetedPlayers
        const dragged = draftContext.draggedPlayer
        const draggedPlayer = dragged?.player
        const actualSlot = budgetSlots[targetSlot]
        if (!draggedPlayer || !actualSlot) return;
        const allowedPositions = actualSlot.allowed_positions || []
        if (!allowedPositions.includes(draggedPlayer.position)) return;

        if (!dragged.origin) {
            if (!actualSlot.pick.player_id) {
                mutations.budgetPick(
                    draftContext.draftId,
                    draftContext.drafterId,
                    draggedPlayer,
                    targetSlot,
                    dragged.projected_price,
                );
            }
            return;
        }

        if (takenBy[String(draggedPlayer.player_id)]) {
            alert(`${draggedPlayer.name} was drafted by ${takenBy[String(draggedPlayer.player_id)]} — pick a different backup for ${targetSlot}.`);
            return;
        }
        const occupantPick = actualSlot.pick;
        // A budget row mirroring one of the DRAFTER's own picks is settled:
        // nothing in this table can undo a pick, so a backup must not be
        // promoted over it (it would leave the pick standing with no budget
        // row). Keyed on the PLAYER, like the staging modal's locks — the row
        // may have been re-slotted away from the pick's slot.
        if (occupantPick.player_id && drafterPlayerIds.has(String(occupantPick.player_id))) {
            alert(`${occupantPick.player_name} is already drafted at ${targetSlot}, so the slot is settled.`);
            return;
        }
        const occupant = occupantPick.player_id
            ? {
                player_id: occupantPick.player_id,
                player_name: occupantPick.player_name,
                position: occupantPick.position,
                projected_price: occupantPick.projected_price,
            }
            : null;
        mutations.promoteBackup(
            draftContext.draftId,
            draftContext.drafterId,
            dragged.origin,
            targetSlot,
            {
                player_id: draggedPlayer.player_id,
                player_name: draggedPlayer.player_name || draggedPlayer.name,
                position: draggedPlayer.position,
                projected_price: dragged.projected_price ?? draggedPlayer.projected_price,
            },
            occupant,
        );
    }

    const backupsBySlot = draftContext.backupsBySlot || {};
    const ranks = Array.from({ length: BACKUP_DEPTH }, (_, index) => index + 1);

    return (
        <div>
            <div className="component-header flex justify-between items-center gap-2">
                <span>Budgeted Players</span>
                <span className="flex items-center gap-2">
                    {/* Hidden by default, and hidden means GONE rather than
                        narrowed — the columns cost real width, which comes off
                        the board. */}
                    <button
                        className="border border-gray-400 rounded px-1 text-xs font-normal hover:bg-gray-100"
                        onClick={onToggleBackups}
                        title={backupsShown
                            ? "Hide the backup columns"
                            : "Show a shelf of alternates per slot (takes width from the board)"}
                    >
                        {backupsShown ? "Hide ✕" : "Backups ▸"}
                    </button>
                    <button
                        className="text-sm leading-none hover:opacity-70"
                        title="Auto-slot budgeted players by price/position"
                        onClick={shuffleBudget}
                    >🔀</button>
                </span>
            </div>
            {/* With the backups shown, six columns don't fit a phone; only this
                table scrolls sideways, the page keeps its own vertical scroll. */}
            <div className="overflow-x-auto">
            <table className="w-full lg:w-auto">
                <thead>
                    <tr className="component-subheader">
                        <th>Player Name</th>
                        <th>Position</th>
                        <th>Price</th>
                        {backupsShown && ranks.map((rank) => (
                            <th
                                key={rank}
                                className="border-l border-gray-300"
                                title={`Backup ${rank} — the alternate that takes this slot if the plan falls through`}
                            >
                                Backup {rank}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                <tr key={'headers'} className="font-small" style={
                    {background: "blue", color: 'white'}} 
                    >
                    <td></td>
                    <td>Remainder</td>
                    <td>Spent</td>
                    {backupsShown && <td colSpan={BACKUP_DEPTH}></td>}
                </tr>
                <tr key={'budget_total'} className="font-small" style={
                    {background: "blue", color: 'white'}} 
                    >
                    <td>Total:</td>
                    <td>{draftContext.draftDetails.starting_budget - draftContext.budgetSpent}</td>
                    <td>{draftContext.budgetSpent}</td>
                    {backupsShown && <td colSpan={BACKUP_DEPTH}></td>}
                </tr>
                    {Object.entries(draftContext.budgetedPlayers).map(([positionSlot, pickSlot]) => (
                        <BudgetedPick
                            key={positionSlot}
                            positionSlot={positionSlot}
                            pickSlot={pickSlot}
                            draftSend={draftSend}
                            handleDrop={handleDrop}
                            draftContext={draftContext}
                            backups={backupsBySlot[positionSlot] || []}
                            takenBy={takenBy}
                            backupsShown={backupsShown}
                        />
                    ))}
                </tbody>
            </table>
            </div>
        </div>
    )
}
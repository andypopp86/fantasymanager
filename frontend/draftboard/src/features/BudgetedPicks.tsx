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

    const handleDrop = (e) => {
        const targetSlot = draftContext.budgetSlotTargeted
        const budgetSlots = draftContext.budgetedPlayers
        const draggedPlayer = draftContext.draggedPlayer.player
        const actualSlot = budgetSlots[targetSlot]
        const allowedPositions = actualSlot.allowed_positions
        if (allowedPositions.includes(draggedPlayer.position) && !actualSlot.pick.player_id) {
            mutations.budgetPick(
                draftContext.draftId,
                draftContext.drafterId,
                draggedPlayer,
                targetSlot,
                draftContext.draggedPlayer.projected_price,
            );
        }
    }
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

    const backupsBySlot = draftContext.backupsBySlot || {};
    const backupCount = Object.values(backupsBySlot)
        .reduce((acc, shelf) => acc + shelf.filter(Boolean).length, 0);
    const ranks = Array.from({ length: BACKUP_DEPTH }, (_, index) => index + 1);

    return (
        <div>
            <div className="component-header flex justify-between items-center gap-2">
                <span>Budgeted Players</span>
                <span className="flex items-center gap-2">
                    {/* Hidden by default and hidden means GONE, not narrowed —
                        the columns cost real width, which comes off the board.
                        The count rides on the show label because that's when you
                        can't see the shelves. */}
                    <button
                        className="border border-gray-400 rounded px-1 text-xs font-normal hover:bg-gray-100"
                        onClick={onToggleBackups}
                        title={backupsShown
                            ? "Hide the backup columns"
                            : "Show a shelf of alternates per slot (takes width from the board)"}
                    >
                        {backupsShown ? "Hide ✕" : `Backups ▸${backupCount > 0 ? ` (${backupCount})` : ""}`}
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
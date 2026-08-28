import React, { useState } from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import * as mutations from "../lib/mutations";
import type { BackupPickRow, SlotName } from "../lib/draft.schemas";

// ONE backup cell: the alternate parked at (budget slot, rank), rendered as an
// extra column on that slot's row in the Budgeted Players table. Living on the
// row is the whole point — a shelf only means anything beside the slot it backs
// up, so a stolen WR1 target and its replacement read as one line.
//
// The cell is DRAG-ONLY. Clicking does nothing (bar the ✕): dragging a filled
// cell onto a budget row promotes that player into the slot, and dragging it
// onto another cell moves them along the shelf. Clicking used to promote, which
// made every stray click on the widest part of the row a plan edit.
//
// The onClick that IS here only stops propagation, and has to stay: the
// enclosing <tr> is a drop/tap target for the BUDGET slot and a click there
// UNBUDGETS, so an un-stopped click in this cell would clear the budgeted
// player. Every other handler stops propagation for the same reason.
//
// Writes are LOCAL ONLY (backup_cells in Dexie, no server counterpart) except
// promotion, which edits the budget and is owned by the parent's drop handler.

type BackupCellProps = {
    draftId: number,
    slot: SlotName,
    rank: number,
    cell: BackupPickRow | null,
    // The BUDGET slot's eligibility list — a backup stands in for ONE slot, so
    // it has to satisfy that slot's positions like any other candidate for it.
    allowed: string[],
    draggedPlayer: any,
    draftSend: (event: any) => void,
    // player_id (stringified) -> the manager who drafted them, whole field.
    takenBy: Record<string, string>,
};

export default function BackupCell({
    draftId, slot, rank, cell, allowed, draggedPlayer, draftSend, takenBy,
}: BackupCellProps) {
    const [isDragOver, setIsDragOver] = useState(false);

    const taken = cell ? takenBy[String(cell.player_id)] : null;
    const price = cell ? parseInt(String(cell.projected_price)) || 0 : 0;

    // Planned at the projection, matching the budget slots themselves — the live
    // winning price only applies to actual picks.
    const park = (player: any, projectedPrice: number | string) => {
        mutations.backupPick(draftId, player, slot, rank, projectedPrice);
    };

    // Picking the cell up. `origin` is what tells every drop target this came
    // off a shelf rather than out of the player list: the budget row reads it to
    // promote (and to hand the displaced player back to THIS cell), and a
    // sibling cell reads it to move instead of copy.
    const handleDragStart = (e: React.DragEvent) => {
        if (!cell) return;
        e.stopPropagation();
        draftSend({
            type: "drag_player",
            player: {
                player: {
                    player_id: cell.player_id,
                    name: cell.player_name,
                    player_name: cell.player_name,
                    position: cell.position,
                    projected_price: cell.projected_price,
                },
                projected_price: cell.projected_price,
                origin: { slot, rank },
            },
        });
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (!draggedPlayer || !draggedPlayer.player) return;
        if (!allowed.includes(draggedPlayer.player.position)) {
            alert(`${draggedPlayer.player.position} is not eligible for ${slot}.`);
            return;
        }
        // From another cell: a move (the source empties, and a full destination
        // swaps back into it). From anywhere else: a copy, so the same player
        // can back up several slots at once.
        if (draggedPlayer.origin) {
            mutations.moveBackup(draftId, draggedPlayer.origin, { slot, rank });
            return;
        }
        park(draggedPlayer.player, draggedPlayer.projected_price ?? draggedPlayer.player.projected_price ?? 0);
    };

    return (
        <td
            className="border-l border-gray-300 px-1"
            draggable={!!cell}
            onDragStart={handleDragStart}
            onClick={(e) => e.stopPropagation()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            style={{
                background: isDragOver ? "blue"
                    : taken ? "#fecaca"
                    : cell ? POSITION_BG_COLORS[cell.position]
                    : "white",
                color: cell && !taken ? POSITION_FG_COLORS[cell.position] : "black",
                cursor: cell ? "grab" : "default",
            }}
            title={cell
                ? taken
                    ? `${cell.player_name} was drafted by ${taken}`
                    : `Drag ${cell.player_name} ($${price}) onto a budget row to slot them, or onto another cell to move them`
                : `${slot} backup ${rank} — drag a player here`}
        >
            {cell ? (
                <span className="flex items-center gap-1">
                    {/* Fixed width + truncate: a long name ellipsises rather
                        than widening the column out from under the board. */}
                    <span className={`truncate w-28 ${taken ? "line-through" : ""}`}>
                        {cell.player_name}
                    </span>
                    <span className="whitespace-nowrap">${price}</span>
                    <button
                        className="ml-auto px-0.5 hover:text-red-600"
                        onClick={(e) => { e.stopPropagation(); mutations.unbackupPick(draftId, slot, rank); }}
                        title={`Clear ${slot} backup ${rank}`}
                    >
                        ✕
                    </button>
                </span>
            ) : (
                <span className="block text-center text-gray-300 w-28">·</span>
            )}
        </td>
    );
}

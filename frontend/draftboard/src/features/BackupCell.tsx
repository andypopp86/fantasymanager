import React, { useState } from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import * as mutations from "../lib/mutations";
import type { BackupPickRow, SlotName } from "../lib/draft.schemas";

// ONE backup cell: the alternate parked at (budget slot, rank), rendered as an
// extra column on that slot's row in the Budgeted Players table. Living on the
// row is the whole point — a shelf only means anything beside the slot it backs
// up, so a stolen WR1 target and its replacement read as one line.
//
// Every handler stops propagation: the enclosing <tr> is itself a drop/tap
// target for the BUDGET slot (and a click there UNBUDGETS), so an un-stopped
// event here would clear the budgeted player instead of touching the shelf.
//
// Writes are LOCAL ONLY (backup_picks in Dexie, no server counterpart) except
// promotion, which edits the budget through mutations.promoteBackup.

type BackupCellProps = {
    draftId: number,
    drafterId: number,
    slot: SlotName,
    rank: number,
    cell: BackupPickRow | null,
    // The BUDGET slot's eligibility list — a backup stands in for ONE slot, so
    // it has to satisfy that slot's positions like any other candidate for it.
    allowed: string[],
    // The budget slot's current occupant (projected pick shape), and whether
    // that occupant is a player the DRAFTER has already drafted.
    occupantPick: any,
    settled: boolean,
    nominated: any,
    draggedPlayer: any,
    expanded: boolean,
    // player_id (stringified) -> the manager who drafted them, whole field.
    takenBy: Record<string, string>,
};

export default function BackupCell({
    draftId, drafterId, slot, rank, cell, allowed, occupantPick, settled,
    nominated, draggedPlayer, expanded, takenBy,
}: BackupCellProps) {
    const [isDragOver, setIsDragOver] = useState(false);

    const hasNomination = !!(nominated && nominated.player_id);
    const taken = cell ? takenBy[String(cell.player_id)] : null;
    const isTapTarget = !cell && hasNomination && allowed.includes(nominated.position);
    const price = cell ? parseInt(String(cell.projected_price)) || 0 : 0;

    // Planned at the projection, matching the budget slots themselves — the live
    // winning price only applies to actual picks.
    const park = (player: any, projectedPrice: number | string) => {
        mutations.backupPick(draftId, player, slot, rank, projectedPrice);
    };

    // Clicking a filled cell swaps it with the budget slot it backs up.
    const promote = () => {
        if (!cell) return;
        if (taken) {
            alert(`${cell.player_name} was drafted by ${taken} — pick a different backup for ${slot}.`);
            return;
        }
        if (settled) {
            alert(`${occupantPick.player_name} is already drafted at ${slot}, so the slot is settled.`);
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
        mutations.promoteBackup(draftId, drafterId, slot, rank, cell, occupant);
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (cell) {
            promote();
            return;
        }
        if (!hasNomination) return;
        if (!allowed.includes(nominated.position)) {
            alert(`${nominated.position} is not eligible for ${slot}.`);
            return;
        }
        park(nominated, nominated.projected_price ?? 0);
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
        park(draggedPlayer.player, draggedPlayer.projected_price ?? draggedPlayer.player.projected_price ?? 0);
    };

    return (
        <td
            className="border-l border-gray-300 px-1"
            onClick={handleClick}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            style={{
                background: isDragOver ? "blue"
                    : taken ? "#fecaca"
                    : cell ? POSITION_BG_COLORS[cell.position]
                    : isTapTarget ? "#dbeafe"
                    : "white",
                color: cell && !taken ? POSITION_FG_COLORS[cell.position] : "black",
            }}
            title={cell
                ? taken
                    ? `${cell.player_name} was drafted by ${taken}`
                    : `Swap ${cell.player_name} ($${price}) into ${slot}`
                : isTapTarget
                    ? `Back up ${slot} with ${nominated.name}`
                    : `${slot} backup ${rank} — drag a player here`}
        >
            {cell ? (
                <span className="flex items-center gap-1">
                    <span className={`truncate ${expanded ? "w-28" : "w-14"} ${taken ? "line-through" : ""}`}>
                        {cell.player_name}
                    </span>
                    {expanded && <span className="whitespace-nowrap">${price}</span>}
                    <button
                        className="ml-auto px-0.5 hover:text-red-600"
                        onClick={(e) => { e.stopPropagation(); mutations.unbackupPick(draftId, cell.player_id); }}
                        title={`Clear ${slot} backup ${rank}`}
                    >
                        ✕
                    </button>
                </span>
            ) : (
                <span className={`block text-center text-gray-300 ${expanded ? "w-28" : "w-14"}`}>
                    {isTapTarget ? "＋" : "·"}
                </span>
            )}
        </td>
    );
}

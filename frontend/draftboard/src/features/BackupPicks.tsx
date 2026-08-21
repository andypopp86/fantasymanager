import React, { useMemo, useState } from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import * as mutations from "../lib/mutations";
import { BACKUP_DEPTH } from "../lib/draft.schemas";
import type { BackupPickRow, SlotName } from "../lib/draft.schemas";

// A shelf of pre-picked alternates BEHIND EACH BUDGET SLOT: the WR1 shelf says
// who takes WR1 if the WR1 target gets bought by someone else. One row per
// budget slot, BACKUP_DEPTH cells deep, mirroring the budget table's slot order
// so the two read side by side.
//
// It is not the budget and not a roster: nothing here counts against
// budgetSpent, and rows are LOCAL ONLY (backup_picks in Dexie, no server
// counterpart) — which is why every write goes through backupPick /
// unbackupPick / promoteBackup rather than the budget mutations directly.
//
// Because a backup stands in for ONE specific slot, it must satisfy that slot's
// allowed_positions — same rule as any other candidate for it, and the same
// blue-outline affordance the board and budget panel use for eligible targets.
//
// In: drop an available player on a cell, or tap a cell while someone is
// nominated. Out: ✕ clears the cell; clicking a filled cell PROMOTES into that
// budget slot — a swap, so the displaced budgeted player lands in the cell just
// vacated and clicking again puts things back.
//
// Expanded is the "I'm working the backups now" mode: on desktop Draft.tsx
// moves the panel into its own grid column and the width comes off the board
// (secondary functionality only gets room when asked).

type BackupPicksProps = {
    draftContext: any,
    expanded: boolean,
    onToggleExpanded: () => void,
};

export default function BackupPicks({ draftContext, expanded, onToggleExpanded }: BackupPicksProps) {
    const [dragOverCell, setDragOverCell] = useState<string | null>(null);
    const { draftId, drafterId, budgetedPlayers = {}, backupsBySlot = {} } = draftContext;

    const nominated = draftContext.nominatedPlayer;
    const hasNomination = !!(nominated && nominated.player_id);

    // Budget slots in board order — the same list, and the same order, as the
    // budget table, so the shelves line up with what they back up.
    const slots = useMemo(
        () => Object.entries(budgetedPlayers)
            .sort(([, a]: [string, any], [, b]: [string, any]) => a.order - b.order)
            .map(([slot, slotObj]: [string, any]) => ({
                slot: slot as SlotName,
                allowed: slotObj.allowed_positions || [],
                pick: slotObj.pick,
            })),
        [budgetedPlayers],
    );

    // A backup whose player got drafted is dead weight — the whole point is
    // reacting to that, so say who took them instead of silently dropping the
    // row. Read from the LOCAL manager projections, so a pick made this session
    // counts immediately.
    const takenBy = useMemo(() => {
        const map: Record<string, string> = {};
        (draftContext.managers || []).forEach((manager: any) => {
            Object.values(manager.draft_picks || {}).forEach((pickSlot: any) => {
                if (pickSlot.pick.player_id) map[String(pickSlot.pick.player_id)] = manager.manager_name;
            });
        });
        return map;
    }, [draftContext.managers]);

    // Budget rows mirroring one of the DRAFTER's own picks can't be swapped out
    // from here: nothing in this panel can undo a pick, so promoting over one
    // would leave the pick standing with no budget row. Same reasoning as the
    // staging modal's locks, and keyed on the PLAYER for the same reason (the
    // budget row may have been re-slotted away from the pick's slot).
    const drafterDrafted = useMemo(() => {
        const ids = new Set<string>();
        const drafter = (draftContext.managers || []).find((manager: any) => manager.is_drafter);
        Object.values(drafter?.draft_picks || {}).forEach((pickSlot: any) => {
            if (pickSlot.pick.player_id) ids.add(String(pickSlot.pick.player_id));
        });
        return ids;
    }, [draftContext.managers]);

    const filledCount = Object.values(backupsBySlot as Record<string, (BackupPickRow | null)[]>)
        .reduce((acc, shelf) => acc + shelf.filter(Boolean).length, 0);

    const cellKey = (slot: SlotName, rank: number) => `${slot}#${rank}`;

    const park = (slot: SlotName, rank: number, player: any, projectedPrice: number | string) => {
        mutations.backupPick(draftId, player, slot, rank, projectedPrice);
    };

    const handleDrop = (e: React.DragEvent, slot: SlotName, rank: number, allowed: string[]) => {
        e.preventDefault();
        setDragOverCell(null);
        const dragged = draftContext.draggedPlayer;
        if (!dragged || !dragged.player) return;
        if (!allowed.includes(dragged.player.position)) {
            alert(`${dragged.player.position} is not eligible for ${slot}.`);
            return;
        }
        park(slot, rank, dragged.player, dragged.projected_price ?? dragged.player.projected_price ?? 0);
    };

    // Clicking a filled cell swaps it with the budget slot it backs up.
    const promote = (slot: SlotName, rank: number, backup: BackupPickRow, occupantPick: any) => {
        const taken = takenBy[String(backup.player_id)];
        if (taken) {
            alert(`${backup.player_name} was drafted by ${taken} — pick a different backup for ${slot}.`);
            return;
        }
        if (occupantPick.player_id && drafterDrafted.has(String(occupantPick.player_id))) {
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
        mutations.promoteBackup(draftId, drafterId, slot, rank, backup, occupant);
    };

    const handleClick = (slot: SlotName, rank: number, allowed: string[], cell: BackupPickRow | null, occupantPick: any) => {
        if (cell) {
            promote(slot, rank, cell, occupantPick);
            return;
        }
        if (!hasNomination) return;
        if (!allowed.includes(nominated.position)) {
            alert(`${nominated.position} is not eligible for ${slot}.`);
            return;
        }
        // Planned at the projection, matching the budget panel — the live
        // winning price only applies to actual picks.
        park(slot, rank, nominated, nominated.projected_price ?? draftContext.nominationPrice ?? 0);
    };

    const ranks = Array.from({ length: BACKUP_DEPTH }, (_, index) => index + 1);
    const nameWidth = expanded ? "w-32" : "w-16";

    return (
        <div>
            <div className="component-header flex items-center justify-between gap-2">
                <span>Backups {filledCount > 0 ? `(${filledCount})` : ""}</span>
                <button
                    className="border border-gray-400 rounded px-1 text-xs font-normal hover:bg-gray-100"
                    onClick={onToggleExpanded}
                    title={expanded
                        ? "Shrink the backups back into the sidebar"
                        : "Give the backups their own column (takes width from the board)"}
                >
                    {expanded ? "Shrink ⤡" : "Expand ⤢"}
                </button>
            </div>
            {expanded && (
                <p className="text-xs text-gray-500 px-1 pb-1">
                    Alternates per budget slot. Click one to swap it into that slot — whoever it
                    replaces takes its place here.
                </p>
            )}
            <table className="w-full lg:w-auto">
                <thead>
                    <tr className="component-subheader">
                        <th className="text-left">Slot</th>
                        {ranks.map((rank) => <th key={rank}>{expanded ? `Backup ${rank}` : `B${rank}`}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {slots.map(({ slot, allowed, pick }) => {
                        const shelf: (BackupPickRow | null)[] = backupsBySlot[slot] || [];
                        const settled = !!pick.player_id && drafterDrafted.has(String(pick.player_id));
                        return (
                            <tr key={slot} className="font-small border border-gray">
                                <td className="whitespace-nowrap pr-1">
                                    <span className="font-semibold">{slot}</span>
                                    {/* What this shelf is standing behind, so the
                                        swap is legible without reading across. */}
                                    {expanded && pick.player_id && (
                                        <span className={"ml-1 " + (settled ? "text-gray-400" : "text-gray-600")}>
                                            {settled && "🔒 "}{pick.player_name}
                                        </span>
                                    )}
                                </td>
                                {ranks.map((rank) => {
                                    const cell = shelf[rank - 1] || null;
                                    const taken = cell ? takenBy[String(cell.player_id)] : null;
                                    const isTapTarget = !cell && hasNomination && allowed.includes(nominated.position);
                                    const key = cellKey(slot, rank);
                                    return (
                                        <td
                                            key={rank}
                                            className="border border-gray-200 px-1"
                                            style={{
                                                background: dragOverCell === key ? "blue"
                                                    : taken ? "#fecaca"
                                                    : cell ? POSITION_BG_COLORS[cell.position]
                                                    : isTapTarget ? "#dbeafe"
                                                    : "white",
                                                color: cell && !taken ? POSITION_FG_COLORS[cell.position] : undefined,
                                            }}
                                            onClick={() => handleClick(slot, rank, allowed, cell, pick)}
                                            onDrop={(e) => handleDrop(e, slot, rank, allowed)}
                                            onDragOver={(e) => { e.preventDefault(); setDragOverCell(key); }}
                                            onDragLeave={() => setDragOverCell(null)}
                                            title={cell
                                                ? taken
                                                    ? `${cell.player_name} was drafted by ${taken}`
                                                    : `Swap ${cell.player_name} ($${parseInt(String(cell.projected_price)) || 0}) into ${slot}`
                                                : isTapTarget
                                                    ? `Back up ${slot} with ${nominated.name}`
                                                    : `${slot} backup ${rank} — drag a player here`}
                                        >
                                            {cell ? (
                                                <div className="flex items-center gap-1">
                                                    <span className={`truncate ${nameWidth} ${taken ? "line-through" : ""}`}>
                                                        {cell.player_name}
                                                    </span>
                                                    {expanded && (
                                                        <span className="whitespace-nowrap">
                                                            ${parseInt(String(cell.projected_price)) || 0}
                                                        </span>
                                                    )}
                                                    <button
                                                        className="ml-auto px-0.5 hover:text-red-600"
                                                        onClick={(e) => { e.stopPropagation(); mutations.unbackupPick(draftId, cell.player_id); }}
                                                        title={`Clear ${slot} backup ${rank}`}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className={`block ${nameWidth} text-center text-gray-300`}>
                                                    {isTapTarget ? "＋" : "·"}
                                                </span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

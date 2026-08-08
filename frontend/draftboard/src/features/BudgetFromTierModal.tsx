import React, { useEffect, useMemo, useRef, useState } from "react";
import { applyBudgetChanges } from "../lib/mutations";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import {
    currentSlotByPlayer,
    diffStagedBudget,
    initialAssignments,
    isEligible,
    key,
    stagedSpend,
    toStagedSlots,
} from "../utils/budgetStaging";
import type { BaselineEntry, StagedOccupant, StagedSlot } from "../utils/budgetStaging";

type BudgetFromTierModalProps = {
    // The tier player being worked into the budget.
    player: { player_id: number | string, name: string, position: string, projected_price: number | string },
    draftContext: any,
    onClose: () => void,
};

const money = (value: any) => parseInt(String(value)) || 0;

// Staged budget editor, opened by clicking a player in the tier board.
//
// The old BudgetConflictModal could only trade one player for one slot, which
// is the wrong shape for this: adding a target usually means dropping SEVERAL
// players and MOVING the incumbent rather than losing them. So nothing here is
// a swap — slots and an "out of the budget" tray are two ends of one staging
// area, and the whole arrangement is committed at once:
//
//   ✕ on a slot  → its player drops to the tray (that is the removal)
//   click a tray player, then a slot → places (or moves) them there
//   whatever is left in the tray when you apply → unbudgeted
//
// Nothing is written until Apply, so a half-finished rearrangement can't leave
// the plan in a broken state.
export default function BudgetFromTierModal({ player, draftContext, onClose }: BudgetFromTierModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    useEffect(() => { dialogRef.current?.showModal(); }, []);

    const { draftId, drafterId, managers, budgetedPlayers, draftDetails } = draftContext;
    const startingBudget = Number(draftDetails?.starting_budget) || 0;
    const drafter = managers.find((manager: any) => manager.is_drafter);

    // Frozen for the life of the modal, deliberately. budgetedPlayers is a live
    // Dexie projection, so a pick landing mid-edit would move the baseline out
    // from under `assignments` (which is only initialized once) and the diff
    // would be computed against a plan the user never saw. Staging is against
    // the plan as it looked when the modal opened; the writes are per-player, so
    // a concurrent change to a player you didn't stage survives untouched.
    const [slots] = useState<StagedSlot[]>(() => toStagedSlots(budgetedPlayers));
    const [baseline] = useState<Record<string, BaselineEntry>>(() => currentSlotByPlayer(slots));
    const alreadyBudgeted = !!baseline[key(player.player_id)];

    const [assignments, setAssignments] = useState<Record<string, StagedOccupant | null>>(
        () => initialAssignments(slots, drafter?.draft_picks),
    );

    // Players staged OUT of the budget. The clicked player starts here unless
    // they're already budgeted, in which case they're just shown in place.
    const [tray, setTray] = useState<StagedOccupant[]>(() => (
        alreadyBudgeted ? [] : [{
            player_id: player.player_id,
            name: player.name,
            position: player.position,
            price: money(player.projected_price),
            drafted: false,
        }]
    ));

    // Selection is tracked by key(), not the raw id — it's only ever compared.
    const [selectedKey, setSelectedKey] = useState<string | null>(
        alreadyBudgeted ? null : key(player.player_id),
    );
    const [applying, setApplying] = useState(false);

    const selected = tray.find((occupant) => key(occupant.player_id) === selectedKey) || null;

    // ✕ — the occupant leaves its slot for the tray, and is armed so the very
    // next slot click moves it (removing and moving are the same gesture, which
    // is what makes "keep them, just not here" cheap).
    const popToTray = (slot: string) => {
        const occupant = assignments[slot];
        if (!occupant || occupant.drafted) return;
        setAssignments((prev) => ({ ...prev, [slot]: null }));
        setTray((prev) => [...prev, occupant]);
        setSelectedKey(key(occupant.player_id));
    };

    // Place the armed tray player. Landing on an occupied slot displaces its
    // occupant to the tray rather than dropping it silently.
    const placeInSlot = (slot: StagedSlot) => {
        if (!selected || !isEligible(slot, selected)) return;
        const occupant = assignments[slot.slot];
        if (occupant?.drafted) return;
        setAssignments((prev) => ({ ...prev, [slot.slot]: selected }));
        setTray((prev) => [
            ...prev.filter((entry) => key(entry.player_id) !== key(selected.player_id)),
            ...(occupant ? [occupant] : []),
        ]);
        setSelectedKey(occupant ? key(occupant.player_id) : null);
    };

    const spend = stagedSpend(slots, assignments);
    const remaining = startingBudget - spend;

    const changes = useMemo(
        () => diffStagedBudget(slots, assignments, baseline),
        [slots, assignments, baseline],
    );

    const removedNames = tray
        .filter((occupant) => baseline[key(occupant.player_id)])
        .map((occupant) => occupant.name);
    const hasChanges = changes.unbudget.length > 0 || changes.place.length > 0;

    const apply = async () => {
        if (!hasChanges) return;
        setApplying(true);
        try {
            await applyBudgetChanges(draftId, drafterId, changes);
            onClose();
        } finally {
            setApplying(false);
        }
    };

    const chip = (occupant: { name: string, position: string }) => (
        <span
            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold leading-none"
            style={{
                background: POSITION_BG_COLORS[occupant.position],
                color: POSITION_FG_COLORS[occupant.position],
            }}
        >
            {occupant.position}
        </span>
    );

    return (
        <dialog
            ref={dialogRef}
            onCancel={(e) => { e.preventDefault(); onClose(); }}
            style={{ position: "fixed", inset: 0, background: "transparent", maxWidth: "100%", maxHeight: "100%" }}
        >
            <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-start justify-center p-4">
                <div className="bg-white rounded-lg w-full max-w-2xl my-4">

                    <div className="px-5 py-3 border-b border-gray-200">
                        <h2 className="text-lg font-bold">Budget {player.name}</h2>
                        <p className="text-sm text-gray-600">
                            Click a player below, then click a slot to place or move them. ✕ takes a player
                            out of the plan. Nothing is saved until you apply.
                        </p>
                    </div>

                    <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                            Not in the budget
                        </div>
                        {tray.length === 0 && (
                            <p className="text-xs text-gray-400">
                                Everyone is placed. ✕ a slot to take someone out.
                            </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {tray.map((occupant) => (
                                <button
                                    key={key(occupant.player_id)}
                                    onClick={() => setSelectedKey(
                                        selectedKey === key(occupant.player_id) ? null : key(occupant.player_id),
                                    )}
                                    className={
                                        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm bg-white " +
                                        (selectedKey === key(occupant.player_id)
                                            ? "border-blue-500 ring-2 ring-blue-300"
                                            : "border-gray-300 hover:bg-gray-100")
                                    }
                                >
                                    {chip(occupant)}
                                    <span className="font-semibold">{occupant.name}</span>
                                    <span className="text-gray-500">${occupant.price}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="px-5 py-3 max-h-[45vh] overflow-y-auto">
                        <table className="w-full text-sm">
                            <tbody>
                                {slots.map((slot) => {
                                    const occupant = assignments[slot.slot];
                                    const eligible = isEligible(slot, selected) && !occupant?.drafted;
                                    return (
                                        <tr key={slot.slot} className="border-b border-gray-100 last:border-0">
                                            <td className="py-1.5 pr-2 font-semibold text-gray-700 w-20">{slot.slot}</td>
                                            <td className="py-1.5">
                                                <button
                                                    onClick={() => placeInSlot(slot)}
                                                    disabled={!eligible}
                                                    className={
                                                        "w-full text-left rounded-md border px-2 py-1 " +
                                                        (eligible
                                                            ? "border-blue-500 bg-blue-50 hover:bg-blue-100 cursor-pointer"
                                                            : "border-transparent cursor-default")
                                                    }
                                                    title={eligible ? `Place ${selected?.name} here` : undefined}
                                                >
                                                    {occupant ? (
                                                        <span className="inline-flex items-center gap-1.5">
                                                            {chip(occupant)}
                                                            <span className="font-semibold">{occupant.name}</span>
                                                            <span className="text-gray-500">${occupant.price}</span>
                                                            {occupant.drafted && (
                                                                <span className="text-xs text-gray-500" title="Drafted — locked here">🔒</span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-300">— empty —</span>
                                                    )}
                                                </button>
                                            </td>
                                            <td className="py-1.5 pl-2 w-8 text-right">
                                                {occupant && !occupant.drafted && (
                                                    <button
                                                        className="text-gray-400 hover:text-red-600 px-1"
                                                        onClick={() => popToTray(slot.slot)}
                                                        title={`Take ${occupant.name} out of the plan`}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
                        <div className="flex items-center justify-between text-sm font-semibold mb-2">
                            <span>Budgeted ${spend} of ${startingBudget}</span>
                            <span style={{ color: remaining < 0 ? "#dc2626" : "#16a34a" }}>
                                ${remaining} left
                            </span>
                        </div>
                        {removedNames.length > 0 && (
                            <p className="text-xs text-gray-600 mb-2">
                                Removing from the budget: {removedNames.join(", ")}
                            </p>
                        )}
                        {remaining < 0 && (
                            <p className="text-xs text-yellow-800 bg-yellow-100 rounded px-2 py-1 mb-2">
                                ⚠️ This plan is ${Math.abs(remaining)} over budget.
                            </p>
                        )}
                        <div className="flex justify-end gap-2">
                            <button
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md text-sm"
                                onClick={onClose}
                            >
                                Cancel
                            </button>
                            <button
                                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-40 disabled:hover:bg-green-500"
                                onClick={apply}
                                disabled={!hasChanges || applying}
                            >
                                {applying ? "Applying…" : "Apply"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </dialog>
    );
}

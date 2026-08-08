import React, { useEffect, useMemo, useRef, useState } from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import {
    currentSlotByPlayer,
    diffStagedBudget,
    initialStaging,
    isEligible,
    key,
    stagedSpend,
    toStagedSlots,
} from "../utils/budgetStaging";
import type { BaselineEntry, BudgetChanges, StagedOccupant, StagedSlot } from "../utils/budgetStaging";

type BudgetStagingModalProps = {
    // The player being worked into the budget, with the dollars to budget them
    // at (a projection from the tier board, the winning price when drafting).
    player: { player_id: number | string, name: string, position: string, price: number },
    // Set to pin the player to one slot: the drafting path, where the budget
    // mirrors the roster so the slot isn't a choice. Null lets the user place
    // them anywhere eligible.
    pinnedSlot?: string | null,
    draftContext: any,
    title: string,
    intro: React.ReactNode,
    confirmLabel: string,
    cancelLabel: string,
    // Receives the staged diff. The caller decides what it means — the tier path
    // just applies it; the drafting path applies it and then submits the pick.
    onConfirm: (changes: BudgetChanges) => Promise<void> | void,
    onCancel: () => void,
};

// Staged budget editor, shared by both ways of working a player into the plan:
// clicking a tier player, and drafting into a budget slot someone else holds.
//
// It replaced a one-for-one trade, which was the wrong shape for either: making
// room usually means dropping SEVERAL players and MOVING the incumbent rather
// than losing them. So nothing here is a swap — slots and an "out of the budget"
// tray are two ends of one staging area, and the whole arrangement is committed
// at once:
//
//   ✕ on a slot  → its player drops to the tray (that is the removal)
//   click a tray player, then a slot → places (or moves) them there
//   whatever is left in the tray when you confirm → unbudgeted
//
// Nothing is written until confirm, so a half-finished rearrangement can't leave
// the plan in a broken state — and on the drafting path, cancelling abandons the
// pick with the budget untouched.
export default function BudgetStagingModal({
    player, pinnedSlot = null, draftContext, title, intro, confirmLabel, cancelLabel, onConfirm, onCancel,
}: BudgetStagingModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    useEffect(() => { dialogRef.current?.showModal(); }, []);

    const { managers, budgetedPlayers, draftDetails } = draftContext;
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
    const [opening] = useState(() => initialStaging(slots, drafter?.draft_picks, player, pinnedSlot));

    const [assignments, setAssignments] = useState<Record<string, StagedOccupant | null>>(opening.assignments);

    // Players staged OUT of the budget.
    const [tray, setTray] = useState<StagedOccupant[]>(opening.tray);

    // Selection is tracked by key(), not the raw id — it's only ever compared.
    const [selectedKey, setSelectedKey] = useState<string | null>(opening.selectedKey);
    const [applying, setApplying] = useState(false);

    const selected = tray.find((occupant) => key(occupant.player_id) === selectedKey) || null;

    // ✕ — the occupant leaves its slot for the tray, and is armed so the very
    // next slot click moves it (removing and moving are the same gesture, which
    // is what makes "keep them, just not here" cheap).
    const popToTray = (slot: string) => {
        const occupant = assignments[slot];
        if (!occupant || occupant.locked) return;
        setAssignments((prev) => ({ ...prev, [slot]: null }));
        setTray((prev) => [...prev, occupant]);
        setSelectedKey(key(occupant.player_id));
    };

    // Place the armed tray player. Landing on an occupied slot displaces its
    // occupant to the tray rather than dropping it silently.
    const placeInSlot = (slot: StagedSlot) => {
        if (!selected || !isEligible(slot, selected)) return;
        const occupant = assignments[slot.slot];
        if (occupant?.locked) return;
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

    // On the drafting path the pinned player is always a placement, so there is
    // always something to confirm — the pick still has to be submitted even if
    // the user rearranged nothing.
    const confirm = async () => {
        if (!hasChanges) return;
        setApplying(true);
        try {
            await onConfirm(changes);
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
            onCancel={(e) => { e.preventDefault(); onCancel(); }}
            style={{ position: "fixed", inset: 0, background: "transparent", maxWidth: "100%", maxHeight: "100%" }}
        >
            <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-start justify-center p-4">
                <div className="bg-white rounded-lg w-full max-w-2xl my-4">

                    <div className="px-5 py-3 border-b border-gray-200">
                        <h2 className="text-lg font-bold">{title}</h2>
                        <p className="text-sm text-gray-600">{intro}</p>
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
                                    const eligible = isEligible(slot, selected) && !occupant?.locked;
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
                                                            {occupant.locked && (
                                                                <span
                                                                    className="text-xs text-gray-500"
                                                                    title={slot.slot === pinnedSlot
                                                                        ? "Being drafted here — the budget mirrors the roster"
                                                                        : "Already drafted — the pick is final, so this row can't be moved or removed"}
                                                                >
                                                                    🔒 {slot.slot === pinnedSlot ? "drafting" : "drafted"}
                                                                </span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-300">— empty —</span>
                                                    )}
                                                </button>
                                            </td>
                                            <td className="py-1.5 pl-2 w-8 text-right">
                                                {occupant && !occupant.locked && (
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
                                onClick={onCancel}
                            >
                                {cancelLabel}
                            </button>
                            <button
                                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-40 disabled:hover:bg-green-500"
                                onClick={confirm}
                                disabled={!hasChanges || applying}
                            >
                                {applying ? "Working…" : confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </dialog>
    );
}

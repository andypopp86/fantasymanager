import React, { useState, useRef, useEffect } from "react";

const REMOVE = "__remove__";

type Pending = {
    player: any;        // the player being drafted (B)
    price: number;      // winning price paid for B
    positionSlot: string; // budget/draft slot B lands in
    displaced: any;     // the budget pick B is displacing (A)
};

type BudgetConflictModalProps = {
    pending: Pending;
    draftContext: any;
    onConfirm: (resolution: { keptSlot: string | null; removeSlots: string[] }) => void;
    onCancel: () => void;
};

// Raised when drafting a player to the owner's team would overwrite a budget slot
// that holds a *different* player. Lets the owner keep the displaced player by
// moving it to an eligible open slot, and drop other budgeted players so the
// plan fits the remaining budget. Advisory: Confirm is always enabled.
export default function BudgetConflictModal({ pending, draftContext, onConfirm, onCancel }: BudgetConflictModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    useEffect(() => { dialogRef.current?.showModal(); }, []);

    const { player, price, positionSlot: draftSlot, displaced } = pending;
    const budgeted = draftContext.budgetedPlayers;
    const startingBudget = Number(draftContext.draftDetails.starting_budget);

    const [removals, setRemovals] = useState<Set<string>>(new Set());
    const toggleRemoval = (slot: string) => {
        setRemovals((prev) => {
            const next = new Set(prev);
            next.has(slot) ? next.delete(slot) : next.add(slot);
            return next;
        });
    };

    const isEmpty = (pick: any) => !pick.player_id || pick.player_id === "";

    // Slots the displaced player may move into: not the drafted slot, currently
    // empty (or freed by a pending removal), and positionally eligible per the
    // slot's allowed_positions (QB/DEF → own slot + BENCH; RB/WR/TE → own + FLEX
    // + BENCH; any → BENCH). Mirrors the server's ALLOWED_POSITIONS.
    const eligibleSlots = Object.entries(budgeted)
        .filter(([slot]: [string, any]) => slot !== draftSlot)
        .filter(([slot, ps]: [string, any]) => isEmpty(ps.pick) || removals.has(slot))
        .filter(([, ps]: [string, any]) => (ps.allowed_positions || []).includes(displaced.position))
        .map(([slot]) => slot);

    // Default to removing the displaced player from the budget; the owner can opt
    // to keep it by choosing an eligible slot instead.
    const [keptChoice, setKeptChoice] = useState<string>(REMOVE);
    // Keep the selection valid as removals change which slots are available.
    useEffect(() => {
        if (keptChoice !== REMOVE && !eligibleSlots.includes(keptChoice)) {
            setKeptChoice(eligibleSlots[0] ?? REMOVE);
        }
    }, [removals]); // eslint-disable-line react-hooks/exhaustive-deps

    const keepA = keptChoice !== REMOVE;

    // Players (other than A and B) the owner can drop to free budget.
    const removalCandidates = Object.entries(budgeted)
        .filter(([slot, ps]: [string, any]) => slot !== draftSlot && !isEmpty(ps.pick))
        .filter(([, ps]: [string, any]) => String(ps.pick.player_id) !== String(displaced.player_id))
        .filter(([, ps]: [string, any]) => String(ps.pick.player_id) !== String(player.player_id));

    // Live remainder for the resulting plan: B at the drafted slot, A kept (or not),
    // selected removals dropped, and B's old budget slot (if any) freed.
    const spend = Object.entries(budgeted).reduce((sum, [slot, ps]: [string, any]) => {
        if (slot === draftSlot) return sum + Number(price);
        if (removals.has(slot)) return sum;
        if (String(ps.pick.player_id) === String(player.player_id)) return sum;
        return sum + Number(ps.pick.actual_price || ps.pick.projected_price || 0);
    }, 0);
    const totalSpend = keepA ? spend + Number(displaced.projected_price || 0) : spend;
    const remainder = startingBudget - totalSpend;

    const confirm = () => onConfirm({ keptSlot: keepA ? keptChoice : null, removeSlots: Array.from(removals) });

    return (
        <dialog
            ref={dialogRef}
            onCancel={(e) => { e.preventDefault(); onCancel(); }}
            style={{ position: "fixed", inset: 0, background: "transparent", maxWidth: "100%", maxHeight: "100%" }}
        >
            <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
                <div className="bg-white rounded-lg p-6 max-w-md w-full">
                    <h2 className="text-lg font-bold mb-1">Budget slot conflict</h2>
                    <p className="text-sm text-gray-700 mb-4">
                        You drafted <b>{player.name}</b> (${price}) into <b>{draftSlot}</b>, which was
                        budgeted for <b>{displaced.player_name}</b> (${parseInt(displaced.projected_price) || 0}).
                    </p>

                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                            Keep {displaced.player_name}?
                        </label>
                        <select
                            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                            value={keptChoice}
                            onChange={(e) => setKeptChoice(e.target.value)}
                        >
                            {eligibleSlots.map((slot) => (
                                <option key={slot} value={slot}>Keep — move to {slot}</option>
                            ))}
                            <option value={REMOVE}>Don't keep — remove from budget</option>
                        </select>
                        {eligibleSlots.length === 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                                No open eligible slot — remove a player below to free one for {displaced.player_name}.
                            </p>
                        )}
                    </div>

                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                            Remove from budget to free money
                        </label>
                        {removalCandidates.length === 0 && (
                            <p className="text-xs text-gray-500">No other budgeted players.</p>
                        )}
                        <ul className="max-h-48 overflow-auto border border-gray-200 rounded">
                            {removalCandidates.map(([slot, ps]: [string, any]) => (
                                <li key={slot} className="flex items-center justify-between px-2 py-1 border-b border-gray-100 last:border-0">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={removals.has(slot)}
                                            onChange={() => toggleRemoval(slot)}
                                        />
                                        <span>{ps.pick.player_name}</span>
                                        <span className="text-gray-400">({slot})</span>
                                    </label>
                                    <span className="text-sm text-gray-600">
                                        ${parseInt(ps.pick.actual_price || ps.pick.projected_price) || 0}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex justify-between items-center mb-4 text-sm font-semibold">
                        <span>Remaining budget after pick</span>
                        <span style={{ color: remainder < 0 ? "#dc2626" : "#16a34a" }}>${remainder}</span>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md text-sm"
                            onClick={onCancel}
                        >
                            Cancel draft
                        </button>
                        <button
                            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm"
                            onClick={confirm}
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        </dialog>
    );
}

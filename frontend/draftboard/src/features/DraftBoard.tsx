import React, { useState } from "react";
import { MANAGER_BG_COLORS, MANAGER_FG_COLORS } from "../utils/colors";
import { DraftBoardSlot } from "./DraftBoardSlot";
import { DraftPositions } from "./DraftPositions";
import BudgetConflictModal from "./BudgetConflictModal";
import * as mutations from "../lib/mutations";
import { findBudgetedPositionSlotByPlayerId } from "../utils/draftHelpers";
import { autoSlotAssignments } from "../utils/reordering";

type DraftBoardProps = {
    draftContext: any,
    draftSend: any
}
export const DraftBoard = ({draftContext, draftSend}: DraftBoardProps) => {
    // A drafter pick whose budget slot holds a different player, awaiting the
    // owner's decision in the conflict modal (null when there's nothing pending).
    const [pendingConflict, setPendingConflict] = useState<any>(null);
    // How many rows to hide from the top of the board, to make room for
    // drag-and-drop into the remaining (lower) slots as the draft fills up.
    const [hiddenRows, setHiddenRows] = useState(0);
    // Auto-slot one manager's drafted players by price/position.
    const shuffleTeam = (manager: any) => {
        const players = Object.values(manager.draft_picks || {})
            .map((slot: any) => slot.pick)
            .filter((pick: any) => pick.player_id)
            .map((pick: any) => ({ player_id: pick.player_id, position: pick.position, price: Number(pick.price) }));
        const assignments = autoSlotAssignments(players);
        mutations.reslotPicks(draftContext.draftId, manager.manager_id, assignments);
    };

    // Drop the nominated player onto a specific manager's slot to register the DraftPick.
    const handleDrop = (e, positionSlot: string, manager: any) => {
        e.preventDefault();
        const player = draftContext.nominatedPlayer;
        const price = draftContext.nominationPrice;
        const managerId = manager.manager_id;

        if (!player || !player.player_id) {
            alert("Nominate a player first (drag one into the Nomination area).");
            return;
        }
        if (!price || price < 1) {
            alert("Set a winning price greater than 0 before drafting.");
            return;
        }
        if (price > Number(manager.manager_budget)) {
            alert(`${manager.manager_name} has only $${manager.manager_budget} left — can't draft ${player.name} for $${price}.`);
            return;
        }
        const targetSlot = manager.draft_picks[positionSlot];
        if (targetSlot?.pick?.player_id) {
            alert(`${positionSlot} is already filled by ${targetSlot.pick.name}.`);
            return;
        }
        if (targetSlot?.allowed_positions && !targetSlot.allowed_positions.includes(player.position)) {
            alert(`${player.position} is not eligible for ${positionSlot}.`);
            return;
        }

        const isDrafter = managerId === draftContext.drafterId;

        // Drafting to the owner's team overwrites the matching budget slot. If that
        // slot already holds a *different* player, pause and let the owner decide who
        // to keep/drop instead of silently losing the budgeted player.
        if (isDrafter) {
            const budgetPick = draftContext.budgetedPlayers[positionSlot]?.pick;
            const conflicts = budgetPick && budgetPick.player_id && budgetPick.player_id !== ""
                && String(budgetPick.player_id) !== String(player.player_id);
            if (conflicts) {
                setPendingConflict({ player, price, positionSlot, manager, displaced: budgetPick });
                return;
            }
        }

        finalizeDraft({ player, price, positionSlot, manager });
    }

    // Straightforward (non-conflicting) pick: the mutation mirrors it into the
    // budget (or drops a stolen target), submits, and updates the local rows.
    const finalizeDraft = ({ player, price, positionSlot, manager }) => {
        const budgetedSlot = findBudgetedPositionSlotByPlayerId(draftContext.budgetedPlayers, player.player_id);
        mutations.draftPlayer(
            draftContext.draftId,
            draftContext.drafterId,
            manager.manager_id,
            player,
            price,
            positionSlot,
            budgetedSlot,
        ).then(handleSubmitResult);
    }

    // Successful pick clears the nomination (flow state); the board itself
    // updates via the Dexie live queries.
    const handleSubmitResult = (errMsg: string | null) => {
        if (errMsg == null) {
            draftSend({ type: 'draft_player' });
        } else {
            alert(`Error submitting pick = ${errMsg}`);
        }
    }

    // Owner confirmed the conflict modal: persist the budget changes (keep the
    // displaced player in its new slot, drop the chosen picks, move the drafted
    // player in), then submit the pick.
    const resolveConflict = async ({ keptSlot, removeSlots }) => {
        const { player, price, positionSlot, manager, displaced } = pendingConflict;
        const { draftId, drafterId, budgetedPlayers } = draftContext;

        for (const slot of removeSlots) {
            const playerId = budgetedPlayers[slot]?.pick?.player_id;
            if (playerId) await mutations.unbudgetPick(draftId, drafterId, playerId);
        }
        if (displaced.player_id) {
            if (keptSlot) {
                // Move the displaced player to its new slot (one budget row per player).
                await mutations.budgetPick(draftId, drafterId, displaced, keptSlot, displaced.projected_price);
            } else {
                // Not kept: drop it from the budget, else its row still claims this
                // slot on the server and reappears on the next refetch.
                await mutations.unbudgetPick(draftId, drafterId, displaced.player_id);
            }
        }
        await mutations.budgetPick(draftId, drafterId, player, positionSlot, price);

        setPendingConflict(null);
        mutations.submitPick(draftId, manager.manager_id, player, price, positionSlot).then(handleSubmitResult);
    }
    // Highlight owners who can't cover the current winning price while a player is on the block.
    const nominationActive = !!(draftContext.nominatedPlayer && draftContext.nominatedPlayer.player_id);
    const cannotAfford = (manager: any) =>
        nominationActive && draftContext.nominationPrice > Number(manager.manager_budget);

    return (
        <>
            {pendingConflict && (
                <BudgetConflictModal
                    pending={pendingConflict}
                    draftContext={draftContext}
                    onConfirm={resolveConflict}
                    onCancel={() => setPendingConflict(null)}
                />
            )}
            {draftContext.managers.length === 0 && <div>Loading...</div>}
            {draftContext.managers.length > 0 && 
            <>
            <div className="component-header">Draft Board</div>
            <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `3rem repeat(${draftContext.managers.length}, minmax(0, 1fr))` }}
            >
            <DraftPositions draftContext={draftContext} hiddenRows={hiddenRows} setHiddenRows={setHiddenRows} />
            {draftContext.managers.map((manager, index) => (
                <div key={index} className="border border-gray-300 rounded">
                    <div className="flex justify-center border-b border-gray-300 bg-gray-100">
                        <button
                            className="text-[10px] py-0.5 hover:opacity-70"
                            title="Auto-slot this team by price/position"
                            onClick={() => shuffleTeam(manager)}
                        >🔀</button>
                    </div>
                    <div className={"text-lg text-center font-semibold font-small"} style={cannotAfford(manager)
                        ? {backgroundColor: "black", color: "white"}
                        : {backgroundColor: MANAGER_BG_COLORS[manager.manager_position], color: MANAGER_FG_COLORS[manager.manager_position]}}>
                        <h2 >{manager.manager_name}</h2>
                        <p style={cannotAfford(manager) ? {textDecoration: "line-through"} : undefined}>${manager.manager_budget}</p>
                    </div>
                <div className="mt-1">
                    <ul className="mt-1">
                    {manager.draft_picks && Object.entries(manager.draft_picks)
                        .slice(hiddenRows)
                        .map(([positionSlot, pickSlot]) => (
                        <DraftBoardSlot
                            key={positionSlot}
                            positionSlot={positionSlot}
                            column={index}
                            pickSlot={pickSlot}
                            manager={manager}
                            draftContext={draftContext}
                            draftSend={draftSend}
                            handleDrop={handleDrop}
                        />
                    ))}
                    </ul>
                </div>
                </div>
            ))}
            </div>
            </>
            }
        </>
    )
}
import React, { useState } from "react";
import { MANAGER_BG_COLORS, MANAGER_FG_COLORS } from "../utils/colors";
import { DraftBoardSlot } from "./DraftBoardSlot";
import { DraftPositions } from "./DraftPositions";
import BudgetConflictModal from "./BudgetConflictModal";
import { draftPickSubmit, draftBudgetPick, draftUnbudgetPick, draftReslotPicks } from "../lib/data";
import { findBudgetedPositionSlotByPlayerId, budgetPerRemainingSlot } from "../utils/draftHelpers";
import { getBudgetPerSlotColors } from "../utils/colors";
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
    // Auto-slot one manager's drafted players by price/position: update the UI
    // immediately via the state machine, and persist the new slots to the server.
    const shuffleTeam = (manager: any) => {
        const players = Object.values(manager.draft_picks || {})
            .map((slot: any) => slot.pick)
            .filter((pick: any) => pick.player_id)
            .map((pick: any) => ({ player_id: pick.player_id, position: pick.position, price: Number(pick.price) }));
        const assignments = autoSlotAssignments(players);
        draftSend({ type: "reslot_manager", managerId: manager.manager_id, assignments });
        draftReslotPicks(draftContext.draftId, manager.manager_id, { assignments });
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

        const pickSlot = {
            "pick": {
                "id": null,
                "pick_id": null,
                "name": player.name,
                "price": price,
                "position": player.position,
                "player_id": player.player_id,
                "slot": positionSlot,
                "projected_price": player.projected_price,
            }
        };

        const isDrafter = managerId === draftContext.drafterId;

        // Drafting to the owner's team overwrites the matching budget slot. If that
        // slot already holds a *different* player, pause and let the owner decide who
        // to keep/drop instead of silently losing the budgeted player.
        if (isDrafter) {
            const budgetPick = draftContext.budgetedPlayers[positionSlot]?.pick;
            const conflicts = budgetPick && budgetPick.player_id && budgetPick.player_id !== ""
                && String(budgetPick.player_id) !== String(player.player_id);
            if (conflicts) {
                setPendingConflict({ player, price, positionSlot, manager, pickSlot, displaced: budgetPick });
                return;
            }
        }

        finalizeDraft({ player, price, positionSlot, manager, pickSlot, isDrafter });
    }

    // Mirror a straightforward (non-conflicting) pick into the budget, then submit.
    const finalizeDraft = ({ player, price, positionSlot, manager, pickSlot, isDrafter }) => {
        const managerId = manager.manager_id;
        if (isDrafter) {
            draftBudgetPick(draftContext.draftId, managerId, player.player_id, {
                projected_price: price,
                budget_position: positionSlot,
            });
            draftSend({ type: 'budget_player', positionSlot, player_id: player.player_id, player_name: player.name, price, position: player.position });
        } else {
            const existingBudgetSlot = findBudgetedPositionSlotByPlayerId(draftContext.budgetedPlayers, player.player_id);
            if (existingBudgetSlot) {
                draftSend({ type: 'unbudget_player', positionSlot: existingBudgetSlot });
                draftUnbudgetPick(draftContext.draftId, draftContext.drafterId, player.player_id);
            }
        }
        submitPick({ player, price, positionSlot, manager, pickSlot });
    }

    const submitPick = ({ player, price, positionSlot, manager, pickSlot }) => {
        draftPickSubmit(draftContext.draftId, manager.manager_id, player.player_id, { price, position_slot: positionSlot }).then((response) => {
            const errMsg = response.data['error'];
            if (errMsg == null) {
                draftSend({ type: 'draft_player', pickSlot, price, managerId: manager.manager_id });
            } else {
                alert(`Error submitting pick = ${errMsg}`);
            }
        });
    }

    // Owner confirmed the conflict modal: persist the budget changes (keep the
    // displaced player in its new slot, drop the chosen picks, move the drafted
    // player in), mirror them into the state machine, then submit the pick.
    const resolveConflict = ({ keptSlot, removeSlots }) => {
        const { player, price, positionSlot, manager, pickSlot, displaced } = pendingConflict;
        const { draftId, drafterId, budgetedPlayers } = draftContext;

        removeSlots.forEach((slot) => {
            const playerId = budgetedPlayers[slot]?.pick?.player_id;
            if (playerId) draftUnbudgetPick(draftId, drafterId, playerId);
        });
        if (displaced.player_id) {
            if (keptSlot) {
                // Move the displaced player to its new slot (one budget row per player).
                draftBudgetPick(draftId, drafterId, displaced.player_id, {
                    projected_price: displaced.projected_price,
                    budget_position: keptSlot,
                });
            } else {
                // Not kept: drop it from the budget, else its row still claims this
                // slot on the server and reappears on the next refetch.
                draftUnbudgetPick(draftId, drafterId, displaced.player_id);
            }
        }
        draftBudgetPick(draftId, drafterId, player.player_id, {
            projected_price: price,
            budget_position: positionSlot,
        });

        draftSend({
            type: 'apply_budget_resolution',
            draftSlot: positionSlot,
            draftedPlayer: player,
            price,
            keptSlot: keptSlot || null,
            removeSlots,
        });

        setPendingConflict(null);
        submitPick({ player, price, positionSlot, manager, pickSlot });
    }
    // Dollars per open slot on the drafter's actual team, shown in their header.
    const perSlotBadge = (manager: any) => {
        if (manager.manager_id !== draftContext.drafterId) return null;
        const perSlot = budgetPerRemainingSlot(manager);
        if (perSlot === null) return null;
        return (
            <p
                className="text-xs font-bold rounded mx-1 mb-0.5"
                style={getBudgetPerSlotColors(perSlot)}
                title="Remaining budget minus $1 (reserved for DEF), divided by remaining open slots (excluding DEF)"
            >
                ${perSlot.toFixed(1)}/slot
            </p>
        );
    };

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
                        {perSlotBadge(manager)}
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
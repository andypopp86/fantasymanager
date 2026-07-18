import React from "react";
import { MANAGER_BG_COLORS, MANAGER_FG_COLORS } from "../utils/colors";
import { DraftBoardSlot } from "./DraftBoardSlot";
import { DraftPositions } from "./DraftPositions";
import { draftPickSubmit, draftBudgetPick, draftUnbudgetPick, draftReslotPicks } from "../lib/data";
import { findBudgetedPositionSlotByPlayerId } from "../utils/draftHelpers";
import { autoSlotAssignments } from "../utils/reordering";

type DraftBoardProps = {
    draftContext: any,
    draftSend: any
}
export const DraftBoard = ({draftContext, draftSend}: DraftBoardProps) => {
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

        // Keep the drafter's budget panel consistent with what actually happened.
        if (managerId === draftContext.drafterId) {
            draftBudgetPick(draftContext.draftId, managerId, player.player_id, {
                projected_price: price,
                budget_position: positionSlot,
            });
            draftSend({ type: 'budget_player', positionSlot, player_id: player.player_id, player_name: player.name, price });
        } else {
            const existingBudgetSlot = findBudgetedPositionSlotByPlayerId(draftContext.budgetedPlayers, player.player_id);
            if (existingBudgetSlot) {
                draftSend({ type: 'unbudget_player', positionSlot: existingBudgetSlot });
                draftUnbudgetPick(draftContext.draftId, draftContext.drafterId, player.player_id);
            }
        }

        draftPickSubmit(draftContext.draftId, managerId, player.player_id, { price, position_slot: positionSlot }).then((response) => {
            const errMsg = response.data['error'];
            if (errMsg == null) {
                draftSend({ type: 'draft_player', pickSlot, price, managerId });
            } else {
                alert(`Error submitting pick = ${errMsg}`);
            }
        });
    }
    // Highlight owners who can't cover the current winning price while a player is on the block.
    const nominationActive = !!(draftContext.nominatedPlayer && draftContext.nominatedPlayer.player_id);
    const cannotAfford = (manager: any) =>
        nominationActive && draftContext.nominationPrice > Number(manager.manager_budget);

    return (
        <>
            {draftContext.managers.length === 0 && <div>Loading...</div>}
            {draftContext.managers.length > 0 && 
            <>
            <div className="component-header">Draft Board</div>
            <div className="grid grid-cols-11 gap-1">
            <DraftPositions draftContext={draftContext} />
            {draftContext.managers.map((manager, index) => (
                <div key={index} className="border border-gray-300 rounded">
                    <div className="flex justify-center border-b border-gray-300 bg-gray-100">
                        <button
                            className="text-[10px] py-0.5 hover:opacity-70"
                            title="Auto-slot this team by price/position"
                            onClick={() => shuffleTeam(manager)}
                        >🔀 Reorder</button>
                    </div>
                    <div className={"text-lg text-center font-semibold font-small"} style={cannotAfford(manager)
                        ? {backgroundColor: "black", color: "white"}
                        : {backgroundColor: MANAGER_BG_COLORS[manager.manager_position], color: MANAGER_FG_COLORS[manager.manager_position]}}>
                        <h2 >{manager.manager_name}</h2>
                        <p style={cannotAfford(manager) ? {textDecoration: "line-through"} : undefined}>${manager.manager_budget}</p>
                    </div>
                <div className="mt-1">
                    <ul className="mt-1">
                    {manager.draft_picks && Object.entries(manager.draft_picks).map(([positionSlot, pickSlot]) => (
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
import React from "react";
import BudgetedPick from "./BudgetedPick.tsx";
import { draftBudgetPick, draftReslotBudget } from "../lib/data";
import { autoSlotAssignments } from "../utils/draftHelpers";

export const BudgetedPicks = ({draftContext, draftSend}) => {
    // Auto-slot the budgeted roster: update the UI immediately via the state
    // machine, and persist the new slots to the server.
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
        draftSend({ type: "reslot_budget", assignments });
        draftReslotBudget(draftContext.draftId, draftContext.drafterId, { assignments });
    };

    const handleDrop = (e) => {
        const targetSlot = draftContext.budgetSlotTargeted
        const budgetSlots = draftContext.budgetedPlayers
        const budgetedPlayerPos = draftContext.draggedPlayer.player.position
        const actualSlot = budgetSlots[targetSlot]
        const allowedPositions = actualSlot.allowed_positions
        if (allowedPositions.includes(budgetedPlayerPos) && !actualSlot.player_id) {
            draftSend({
                type: 'budget_player',
                positionSlot: targetSlot,
                player_id: draftContext.draggedPlayer.player.player_id,
                player_name: draftContext.draggedPlayer.player.name,
                price: draftContext.draggedPlayer.projected_price,  // double check this
            });
            const managerId = draftContext.drafterId;
            draftBudgetPick(draftContext.draftId, managerId, draftContext.draggedPlayer.player.player_id, 
                {
                    projected_price: draftContext.draggedPlayer.projected_price,
                    budget_position: targetSlot
                },
            );
        }
    }
    return (
        <div>
            <div className="component-header flex justify-between items-center">
                <span>Budgeted Players</span>
                <button
                    className="text-sm leading-none hover:opacity-70"
                    title="Auto-slot budgeted players by price/position"
                    onClick={shuffleBudget}
                >🔀</button>
            </div>
            <table>
                <thead>
                    <tr className="component-subheader">
                        <th>Player Name</th>
                        <th>Position</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
                <tr key={'headers'} className="font-small" style={
                    {background: "blue", color: 'white'}} 
                    >
                    <td></td>
                    <td>Remainder</td>
                    <td>Spent</td>
                </tr>
                <tr key={'budget_total'} className="font-small" style={
                    {background: "blue", color: 'white'}} 
                    >
                    <td>Total:</td>
                    <td>{draftContext.draftDetails.starting_budget - draftContext.budgetSpent}</td>
                    <td>{draftContext.budgetSpent}</td>
                </tr>
                    {Object.entries(draftContext.budgetedPlayers).map(([positionSlot, pickSlot]) => (
                        <BudgetedPick
                            key={positionSlot}
                            positionSlot={positionSlot}
                            pickSlot={pickSlot}
                            draftSend={draftSend}
                            handleDrop={handleDrop}
                            draftContext={draftContext}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    )
}
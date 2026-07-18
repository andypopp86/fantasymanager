import React from "react";
import BudgetedPick from "./BudgetedPick.tsx";
import { draftBudgetPick } from "../lib/data";

export const BudgetedPicks = ({draftContext, draftSend}) => {
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
            <div className="component-header">Budgeted Players</div>
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
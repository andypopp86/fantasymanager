import React from "react";
import { useState, useEffect } from "react";
import BudgetedPick from "./BudgetedPick.tsx";
import { draftBudgetPick } from "../lib/data";
import { recalculateBudget } from "../utils/draftHelpers";

export const BudgetedPicks = ({draftContext, draftSend}) => {
    const [remainingBudget, setRemainingBudget] = useState(draftContext.draftDetails.starting_budget - draftContext.budgetSpent);
    // curious whether this is necessary. Seemingly fixed the issue by breaking up the state setters into budgetedPlayers and budgetSpent
    // useEffect(() => {
    //     setRemainingBudget(recalculateBudget(draftContext.draftDetails.starting_budget, draftContext.budgetedPlayers));
    // }, [draftContext]);

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
                price: draftContext.draggedPlayer.player.projected_price,
            });
            const managerId = draftContext.drafterId;
            draftBudgetPick(draftContext.draftId, managerId, draftContext.draggedPlayer.player.player_id, 
                {
                    projected_price: draftContext.draggedPlayer.player.projected_price,
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
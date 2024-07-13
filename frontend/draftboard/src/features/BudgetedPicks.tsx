import React from "react";
import BudgetedPick from "./BudgetedPick.tsx";
import { useState } from "react";
import SubmitPick from "./SubmitPick.tsx";

export const BudgetedPicks = ({draftContext, draftSend}) => {
    const handleDrop = (e) => {
        const targetSlot = draftContext.budgetSlotTargeted
        const budgetSlots = draftContext.budgetedPlayers
        const budgetedPlayerPos = draftContext.draggedPlayer.player.position
        const actualSlot = budgetSlots[targetSlot]
        const allowedPositions = actualSlot.allowed_positions
        if (allowedPositions.includes(budgetedPlayerPos) && !actualSlot.player_id) {
            const budgetPlayerToSend = {
                "id": draftContext.draggedPlayer.id,
                "player_id": draftContext.draggedPlayer.player.id,
                "player_name": draftContext.draggedPlayer.player.name,
                "projected_price": draftContext.draggedPlayer.player.projected_price,
            }
            draftSend({
                type: 'budget_player',
                positionSlot: targetSlot,
                budgetPlayerToSend: budgetPlayerToSend
            });
        }
    }
    return (
        <div>
            <div style={{fontSize: "24px", fontWeight: "bold"}}>Budgeted Players</div>
            <table>
                <thead>
                    <tr>
                        <th>Player Name</th>
                        <th>Position</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(draftContext.budgetedPlayers).map(([positionSlot, pick]) => (
                        <BudgetedPick
                            key={positionSlot}
                            positionSlot={positionSlot}
                            pick={pick}
                            draftSend={draftSend}
                            handleDrop={handleDrop}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    )
}
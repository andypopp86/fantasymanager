import React from "react";
import { budgetPerRemainingSlot } from "../utils/draftHelpers";
import { getBudgetPerSlotColors } from "../utils/colors";

// Dollars per open slot on the drafter's actual team, color-coded by how
// tight the budget is. Sits under the Nomination area as a bidding aid.
export const BudgetPerSlot = ({ draftContext }) => {
    const drafter = draftContext.managers.find(
        (manager) => manager.manager_id === draftContext.drafterId
    );
    const perSlot = budgetPerRemainingSlot(drafter);
    if (perSlot === null) return null;
    return (
        <div
            className="text-center text-sm font-bold rounded py-1"
            style={getBudgetPerSlotColors(perSlot)}
            title="Remaining budget minus $1 (reserved for DEF), divided by remaining open slots (excluding DEF)"
        >
            ${perSlot.toFixed(1)}/slot
        </div>
    );
};

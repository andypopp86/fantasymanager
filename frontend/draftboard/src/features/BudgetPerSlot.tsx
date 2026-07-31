import React from "react";
import { budgetPerRemainingSlot, budgetPerRemainingBudgetSlot } from "../utils/draftHelpers";
import { getBudgetPerSlotColors } from "../utils/colors";

// Dollars per open slot, color-coded by how tight the money is — one strip
// for the drafter's actual roster, one for the budget plan. Sits under the
// Nomination area as a bidding aid.
export const BudgetPerSlot = ({ draftContext }) => {
    const drafter = draftContext.managers.find(
        (manager) => manager.manager_id === draftContext.drafterId
    );
    const perDraftSlot = budgetPerRemainingSlot(drafter);
    const perBudgetSlot = budgetPerRemainingBudgetSlot(draftContext);
    return (
        <div className="flex flex-col gap-1">
            {perDraftSlot !== null && (
                <div
                    className="text-center text-sm font-bold rounded py-1"
                    style={getBudgetPerSlotColors(perDraftSlot)}
                    title="Remaining budget minus $1 (reserved for DEF), divided by remaining open roster slots (excluding DEF)"
                >
                    ${perDraftSlot.toFixed(1)}/draft slot
                </div>
            )}
            {perBudgetSlot !== null && (
                <div
                    className="text-center text-sm font-bold rounded py-1"
                    style={getBudgetPerSlotColors(perBudgetSlot)}
                    title="Unbudgeted dollars minus $1 (reserved for DEF), divided by budget slots without a player (excluding DEF)"
                >
                    ${perBudgetSlot.toFixed(1)}/budget slot
                </div>
            )}
        </div>
    );
};

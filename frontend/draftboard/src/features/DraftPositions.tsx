import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";


export const DraftPositions = ({draftContext, hiddenRows, setHiddenRows}) => {
    const actualPositions = ["QB", "RB", "WR", "TE", "DEF"];
    const totalRows = Object.keys(draftContext.budgetedPlayers || {}).length;
    const clampHiddenRows = (value) => Math.max(0, Math.min(totalRows, parseInt(value) || 0));
    const getPositionBGColor = (actualPositions, positionSlot) => {
        
        if (actualPositions.includes(positionSlot.substring(0, 2))) {
            return POSITION_BG_COLORS[positionSlot.substring(0, 2)];
        }
        return "white";
    }

    const getPositionFGColor = (actualPositions, positionSlot) => {
        if (actualPositions.includes(positionSlot.substring(0, 2))) {
            return POSITION_FG_COLORS[positionSlot.substring(0, 2)];
        }
        return "black";
    }
    return (
        <>
            {draftContext && draftContext.budgetedPlayers && 
            <>
                <div className="border border-gray-300 rounded" style={{ fontSize: "0.875rem" }}>
                    <div className="flex justify-center border-b border-gray-300 bg-gray-100">
                        <span className="text-xs py-0.5 font-semibold">&nbsp;</span>
                    </div>
                    <div style={{height: "3.5rem"}}
                        className={"draft-slot flex justify-center items-center"}>
                        <input
                            type="number"
                            min={0}
                            max={totalRows}
                            value={hiddenRows}
                            onChange={(e) => setHiddenRows(clampHiddenRows(e.target.value))}
                            title="Hide this many rows from the top of the board to free up space"
                            className="w-10 text-center border border-gray-300 rounded text-sm"
                        />
                    </div>

                    <ul className="mt-1">
                    {draftContext.budgetedPlayers && Object.entries(draftContext.budgetedPlayers)
                        .slice(hiddenRows)
                        .map(([positionSlot, pickSlot]) => (
                        <li key={positionSlot} className="draft-slot flex justify-center items-center"
                            style={{backgroundColor: getPositionBGColor(actualPositions, positionSlot), color: getPositionFGColor(actualPositions, positionSlot) }}
                            >
                            {positionSlot.replace(/^BENCH(\d+)$/, "B$1")}
                        </li>
                    ))}
                    </ul>
                </div>
            </>
            }
        </>
    )
}
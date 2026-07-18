import React from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";


export const DraftPositions = ({draftContext}) => {
    const actualPositions = ["QB", "RB", "WR", "TE", "DEF"];
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
                <div className="border border-gray-300 rounded">
                    <div className="flex justify-center border-b border-gray-300 bg-gray-100">
                        <span className="text-xs py-0.5 font-semibold">Draft Board</span>
                    </div>
                    <div style={{height: "3.5rem"}}
                        className={"draft-slot flex justify-center items-center"}>
                        <p>Pos</p>
                    </div>

                    <ul className="mt-1">
                    {draftContext.budgetedPlayers && Object.entries(draftContext.budgetedPlayers).map(([positionSlot, pickSlot]) => (
                        <li key={positionSlot} className="draft-slot flex justify-center items-center"
                            style={{backgroundColor: getPositionBGColor(actualPositions, positionSlot), color: getPositionFGColor(actualPositions, positionSlot) }}
                            >
                            {positionSlot}
                        </li>
                    ))}
                    </ul>
                </div>
            </>
            }
        </>
    )
}
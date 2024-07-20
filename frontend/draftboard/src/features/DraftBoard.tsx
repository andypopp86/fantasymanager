import React from "react";
import { MANAGER_BG_COLORS, MANAGER_FG_COLORS } from "../utils/colors";
import { DraftBoardSlot } from "./DraftBoardSlot";

type DraftBoardProps = {
    draftContext: any,
    draftSend: any
}
export const DraftBoard = ({draftContext, draftSend}: DraftBoardProps) => {
    const handleDrop = (e) => {
        return;
        // could maybe do a draft send here but would need to separate the price
        // draftSend({
        //     type: '',
        //     player: draftContext.draggedPlayer,
        // });
    }
    return (
        <>
            {draftContext.managers.length === 0 && <div>Loading...</div>}
            {draftContext.managers.length > 0 && 
            <>
            <div>Draft Board</div>
            <div className="grid grid-cols-10 gap-1">
            {draftContext.managers.map((manager, index) => (
                <div key={index} className="border border-gray-300 rounded">
                    <div className={"text-lg text-center font-semibold font-small"} style={{backgroundColor: MANAGER_BG_COLORS[manager.manager_position],color: MANAGER_FG_COLORS[manager.manager_position]}}>
                        <h2 >{manager.manager_name}</h2>
                        <p>${manager.manager_budget}</p>
                    </div>
                <div className="mt-1">
                    <ul className="mt-1">
                    {manager.draft_picks && Object.entries(manager.draft_picks).map(([positionSlot, pick]) => (
                        <DraftBoardSlot
                            key={positionSlot}
                            positionSlot={positionSlot}
                            column={index}
                            pick={pick}
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
import React from "react";
import { MANAGER_BG_COLORS, MANAGER_FG_COLORS, POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";

import { draftPickUnsubmit } from "../lib/data";



type DraftBoardProps = {
    draftContext: any,
    draftSend: any
}
export const DraftBoard = ({draftContext, draftSend}: DraftBoardProps) => {
    const unsubmitPick = async (draftId: number, managerId: number, pick: any) => {
        if (!draftId || !managerId || !pick) {
            return;
        }
        const result = await draftPickUnsubmit(draftId, managerId, pick.player_id);
        draftSend({
            type: 'undraft_player',
            draftId: draftId,
            managerId: managerId,
            pick: pick
        });
    }
    return (
        <>
            <div>Draft Board</div>
            <div className="grid grid-cols-10 gap-1">
            {draftContext.managers.map((manager, index) => (
                <div key={index} className="border border-gray-300 rounded">
                    <div className={"text-lg text-center font-semibold"} style={{backgroundColor: MANAGER_BG_COLORS[manager.manager_position],color: MANAGER_FG_COLORS[manager.manager_position]}}>
                        <h2 >{manager.manager_name}</h2>
                        <p>${manager.manager_budget}</p>
                    </div>
                <div className="mt-1">
                    <ul className="mt-1">
                    {manager.draft_picks.map((pick, pickIndex) => (
                        <li key={pickIndex} className="flex justify-between border border-gray-300 draft-pick" style={{
                            backgroundColor: POSITION_BG_COLORS[pick.position],
                            color: POSITION_FG_COLORS[pick.position]
                        }} onClick={() => unsubmitPick(draftContext.draftId, manager.manager_id, pick)}>
                        <span className={"border border-gray-300 draft-pick-name"}>{pick.name}</span>
                        <span className={"border border-gray-300 draft-pick-price"}>${pick.price}</span>
                        </li>
                    ))}
                    </ul>
                </div>
                </div>
            ))}
            </div>
        </>
    )
}
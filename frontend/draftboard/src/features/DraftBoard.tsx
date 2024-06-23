import React from "react";
import { Link } from "react-router-dom";
import { DraftManagersOutput, DraftSlotsRetrieveOutput } from "../lib/draft.schemas";

const BG_COLORS = [
    "red", "blue", "green", "orange", "purple", "grey", "yellow", "Goldenrod", "DodgerBlue", "IndianRed", "MediumPurple"
]
const FG_COLORS = [
    "white", "white", "white", "white", "white", "white", "black", "white", "white", "white", "white"
]
const POSITION_BG_COLORS = {
    "RB": "blue",
    "WR": "green",
    "QB": "red",
    "TE": "orange",
    "DEF": "brown",
}
const POSITION_FG_COLORS = {
    "RB": "white",
    "WR": "white",
    "QB": "white",
    "TE": "white",
    "DEF": "white",
}
type DraftBoardProps = {
    managers: DraftManagersOutput,
    draft_rounds: DraftSlotsRetrieveOutput,
}
export const DraftBoard = ({managers, draft_rounds}: DraftBoardProps) => {
    return (
        <>
            <div>Draft Board</div>
            <div className={"min-w-full flex"}>
                {managers?.map((manager) => (
                    <div key={manager.position} className={"w-24"} style={{
                        backgroundColor: BG_COLORS[manager.position],
                        color: FG_COLORS[manager.position],
                        textAlign: "center",
                    }}>{manager.name}</div>
                )
                )
                }
            </div>
            <div className={"bg-slate-200 overflow-x-auto"}>
                <div className={"table-auto min-w-full"}>
                {draft_rounds?.map((round, idx) => (
                            <div key={idx} round-key={round.round} className={"flex"}>
                                {round?.map((slot) => (
                                    <div key={`${slot.round}-${slot.manager_position}`} slot-key={`${slot.round}-${slot.manager_position}`} className={"w-24"} >{slot.pick.name}</div>
                                        )
                                    )
                                }
                            </div>
                        )
                    )
                }

                </div>
            </div>
        </>
    )
}
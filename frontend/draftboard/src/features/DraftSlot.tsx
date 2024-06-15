import React from "react";

type DraftSlotProps = {
    teamNum: Number;
    playerNum: Number;
};

export const DraftSlot = ({
  teamNum,
  playerNum,
}: DraftSlotProps) => {
    return (
        <div>{`Draft Slot ${teamNum}:${playerNum}`}</div>
    )
}
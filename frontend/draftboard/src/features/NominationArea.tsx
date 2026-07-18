import React, { useState } from "react";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";

type NominationAreaProps = {
    draftContext: any;
    draftSend: any;
};

export const NominationArea = ({ draftContext, draftSend }: NominationAreaProps) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const nominatedPlayer = draftContext.nominatedPlayer;
    const hasNomination = !!(nominatedPlayer && nominatedPlayer.player_id);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };
    const handleDragLeave = () => setIsDragOver(false);

    // Drop an available player here to put them "on the block".
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const dragged = draftContext.draggedPlayer;
        if (!dragged || !dragged.player) return;
        draftSend({ type: "nominate_player", player: dragged.player });
    };

    // Dragging the nominated card carries it to a draft-board slot (or a budget slot).
    const handleNominatedDragStart = () => {
        draftSend({
            type: "drag_player",
            player: { player: nominatedPlayer, projected_price: nominatedPlayer.projected_price },
        });
    };

    const handlePriceChange = (e) => {
        draftSend({ type: "set_nomination_price", price: parseInt(e.target.value) || 0 });
    };

    const cancel = () => draftSend({ type: "cancel_nomination" });

    return (
        <div>
            <div className="component-header">Nomination</div>
            <div
                className="border-2 border-dashed rounded p-3 min-h-[140px] flex flex-col items-center justify-center"
                style={{ borderColor: isDragOver ? "blue" : "#cbd5e1", backgroundColor: isDragOver ? "#dbeafe" : "white" }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {!hasNomination && (
                    <p className="text-gray-400 text-center text-sm">Drag a player here to nominate</p>
                )}
                {hasNomination && (
                    <>
                        <div
                            draggable="true"
                            onDragStart={handleNominatedDragStart}
                            className="w-full text-center rounded px-2 py-2 mb-2 cursor-move font-semibold"
                            style={{
                                background: POSITION_BG_COLORS[nominatedPlayer.position],
                                color: POSITION_FG_COLORS[nominatedPlayer.position],
                            }}
                            title="Drag me to a draft-board slot"
                        >
                            {nominatedPlayer.name} ({nominatedPlayer.position})
                        </div>
                        <div className="w-full mb-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Winning price</label>
                            <input
                                type="number"
                                min={1}
                                className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                                value={draftContext.nominationPrice}
                                onChange={handlePriceChange}
                            />
                        </div>
                        {nominatedPlayer.notes && (
                            <ul className="w-full text-xs text-gray-700 list-disc pl-5 mb-2">
                                {nominatedPlayer.notes.split("\n").map((note, index) => (
                                    <li key={index}>{note}</li>
                                ))}
                            </ul>
                        )}
                        <p className="text-gray-500 text-xs text-center mb-2">Drag the card to a slot to draft</p>
                        <div className="flex gap-2">
                            <button
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded-md text-sm"
                                onClick={cancel}
                            >
                                Cancel
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

import React, { useState, useRef, useEffect } from 'react';

import { draftPickSubmit, draftUnbudgetPick } from '../lib/data';
import { findBudgetedPositionSlotByPlayerId } from '../utils/draftHelpers';

type SubmitPickProps = {
    draftContext: any,
    player: any,
    openDialog: boolean,
    setOpenDialog: any,
    draftSend: any
}
export default function SubmitPick({ draftContext, player, setOpenDialog, openDialog, draftSend }: SubmitPickProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const defaultManagerId = draftContext.managers[0].manager_id;
    const [managerId, setManagerId] = useState(defaultManagerId);
    const [price, setPrice] = useState(1);
    const handlePriceChange = (e) => {
        setPrice(e.target.value);
    };        

    const handleManagerChange = (e) => {
        setManagerId(parseInt(e.target.value));
    };

    const submitDraftPick = (player) => {
        if (price < 1) {
            alert("Price must be greater than 0")
            return;
        }
        const pick = {
            "name": player.name,
            "price": price,
            "position": player.position,
            "player_id": player.id,
            "pick_id": null,
            "projected_price": player.projected_price,
        }
        const budgetSlot = findBudgetedPositionSlotByPlayerId(draftContext.budgetedPlayers, pick.player_id)
        if (budgetSlot && managerId !== draftContext.drafterId) {
            draftUnbudgetPick(draftContext.draftId, draftContext.drafterId, pick.player_id);
        }
        
        draftSend({type: 'draft_player', pick: pick, price: price, managerId: managerId});
        draftPickSubmit(draftContext.draftId, managerId, player.id, {price: price});
        setOpenDialog(false);

    }

    const watchDraftPick = (player) => {
        draftSend({type: 'watch_player', player: player});
        setOpenDialog(false);
    }

    useEffect(() => {
        const openModal = () => {
            setManagerId(defaultManagerId);
            draftSend({type: 'nominate_player', player: player});
            dialogRef.current?.showModal();
        };
        const closeModal = () => {
            dialogRef.current?.close();
        }
        (openDialog) ? openModal() : closeModal();
    }, [openDialog]);


    return (
        <dialog
        ref={dialogRef}
        style={{position: "absolute", top: "0", left: "0", right: "0", bottom: "0", backgroundColor: "rgba(0,0,0,0.5)"}}>
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">{player.name}</h2>
            <button
                className="text-gray-500 hover:text-gray-700 focus:outline-none"
                onClick={() => setOpenDialog(false)}
            >
                <svg
                className="h-6 w-6 fill-current"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                >
                <path
                    fillRule="evenodd"
                    d="M13.414 10l3.293 3.293a1 1 0 0 1-1.414 1.414L12 11.414l-3.293 3.293a1 1 0 1 1-1.414-1.414L10.586 10 7.293 6.707a1 1 0 0 1 1.414-1.414L12 8.586l3.293-3.293a1 1 0 1 1 1.414 1.414L13.414 10z"
                />
                </svg>
            </button>
            </div>
            <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
            <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500"
                value={price}
                onChange={handlePriceChange}
            />
            </div>
            <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Manager</label>
            <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500"
                value={managerId}
                onChange={handleManagerChange}
            >
                {draftContext.managers.map((manager) => (
                    <option key={manager.manager_id} value={manager.manager_id}>
                    {manager.manager_name}
                    </option>
                ))}
            </select>
            </div>
            <div className="flex justify-end">
            <button className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md mr-2" onClick={() => watchDraftPick(player)}>
                Watch
            </button>
            <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mr-2" onClick={() => submitDraftPick(player)}>
                Save
            </button>
            <button className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md" onClick={() => setOpenDialog(false)}>
                Cancel
            </button>
            </div>
        </div>
        </div>
        </dialog>
    )
        
    
};





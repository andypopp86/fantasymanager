import React, { useState, useRef, useEffect } from 'react';

import { draftBudgetPick, draftPickSubmit, draftUnbudgetPick } from '../lib/data';
import { findBudgetedPositionSlotByPlayerId, getEmptyBudgetedPositionSlots, getPlayerEligibleBudgetSlots, getPlayerEligibleSlots, managersWhoHitPositionLimit } from '../utils/draftHelpers';

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
    const [slotId, setSlotId] = useState("QB1");
    const [managersNotAllowedToDraftThisPosition, setManagersNotAllowedToDraftThisPosition] = useState(managersWhoHitPositionLimit(draftContext.managers, draftContext.draftDetails, player.position));

    // const [availableBudgetSlots, setAvailableBudgetSlots] = useState(["QB1"]);
    const availableBudgetSlots = ["QB1", "RB1", "RB2", "WR1", "WR2", "TE1", "FLEX1", "FLEX2", "DEF1", "BENCH1", "BENCH2", "BENCH3", "BENCH4", "BENCH5", "BENCH6", "BENCH7"];
    const handlePriceChange = (e) => {
        setPrice(e.target.value);
    };

    const handleManagerChange = (e) => {
        const draftingManagerId = parseInt(e.target.value);
        setManagerId(draftingManagerId);
        refreshPositionSlots(draftingManagerId, draftContext.managers, draftContext.budgetedPlayers, player);
    };

    const refreshPositionSlots = (draftingManagerId, managers, budgetedPlayers, player) => {
        const manager = managers.find((manager) => manager.manager_id === draftingManagerId);
        const emptyBudgetSlots = manager.is_drafter ? getEmptyBudgetedPositionSlots(budgetedPlayers) : [];
        const playerEligibleSlots =  manager.is_drafter ? getPlayerEligibleBudgetSlots(budgetedPlayers, manager.draft_picks, player, emptyBudgetSlots) : getPlayerEligibleSlots(manager.draft_picks, player)
        // setAvailableBudgetSlots(playerEligibleSlots);
        setSlotId(playerEligibleSlots[0]);
    }

    const handleSlotChange = (e) => {
        setSlotId(e.target.value);
    }

    const submitDraftPick = (player) => {
        if (price < 1) {
            alert("Price must be greater than 0")
            return;
        }
        const pickSlot = {
            "pick": {
                "id": null,
                "pick_id": null,
                "name": player.name,
                "price": price,
                "position": player.position,
                "player_id": player.id,
                "slot": slotId,
                "projected_price": player.projected_price,
            }
        }
        const budgetPick = {
            "id": pickSlot.pick.pick_id,
            "player_id": pickSlot.pick.player_id,
            "player_name": pickSlot.pick.name,
            "projected_price": price // price was actually paid in place of projected_price
        }
        if (managerId !== draftContext.drafterId) {
            draftUnbudgetPick(draftContext.draftId, draftContext.drafterId, pickSlot.pick.player_id);
            const budgetSlot = findBudgetedPositionSlotByPlayerId(draftContext.budgetedPlayers, pickSlot.pick.player_id)
        }

        if (managerId === draftContext.drafterId) {
            draftBudgetPick(draftContext.draftId, managerId, pickSlot.pick.player_id,
                {
                    projected_price: price,
                    budget_position: slotId
                }
            );
            const budgetPlayerSendEvent = {
                type: 'budget_player',
                positionSlot: slotId,
                player_id: pickSlot.pick.player_id,
                player_name: pickSlot.pick.name,
                price: price,
            }
            draftSend(budgetPlayerSendEvent);
        }
        draftPickSubmit(draftContext.draftId, managerId, player.id, {price: price, position_slot: slotId}).then((response) => {
            const errMsg = response.data['error']
            if (errMsg == null) {
                draftSend({type: 'draft_player', budgetPlayerToSend: budgetPick, pickSlot: pickSlot, price: price, managerId: managerId});
            } else {
                alert(`Error submitting pick = ${response.data['error']}`)
            }
        });
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
            refreshPositionSlots(defaultManagerId, draftContext.managers, draftContext.budgetedPlayers, player);
        };
        const closeModal = () => {
            dialogRef.current?.close();
        }
        (openDialog) ? openModal() : closeModal();
    }, [openDialog]);

    const cancelNomination = () => {
        setOpenDialog(false);
        draftSend({type: 'cancel_nomination'});
    }

    const isNominatedPlayerInBudget = (player, budgetedPlayers) => {
        return Object.values(budgetedPlayers).some((pickSlot) => pickSlot.pick.player_id === player.id);
    }


    return (
        <dialog
        ref={dialogRef}
        onClose={() => cancelNomination()}
        style={{position: "absolute", top: "0", left: "0", right: "0", bottom: "0", backgroundColor: "rgba(0,0,0,0.5)"}}>
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
        <div className={`${isNominatedPlayerInBudget(player, draftContext.budgetedPlayers)? "bg-yellow-400" : "bg-white"} rounded-lg p-8 max-w-lg w-full`}>
            <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">{player.name}</h2>
            <button
                className="text-gray-500 hover:text-gray-700 focus:outline-none"
                onClick={() => cancelNomination()}
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
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Slot</label>
                <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500"
                    value={slotId}
                    onChange={handleSlotChange}
                >
                    {availableBudgetSlots.map((slot) => (
                        <option key={slot} value={slot}>
                        {slot}
                        </option>
                    ))}
                </select>
            </div>
            </div>
            <div className="flex justify-end">
            <button className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md mr-2" onClick={() => watchDraftPick(player)}>
                Watch
            </button>
            <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mr-2" onClick={() => submitDraftPick(player)}>
                Save
            </button>
            <button className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md" onClick={() => cancelNomination()}>
                Cancel
            </button>
            </div>
            {managersNotAllowedToDraftThisPosition.length > 0 && (
                <div className="mt-4">
                    <p className="text-red-500">
                        {managersNotAllowedToDraftThisPosition.join(', ')} {managersNotAllowedToDraftThisPosition.length > 1 ? "have" : "has"} hit the {player.position} limit
                    </p>
                </div>
            )}
        </div>
        </div>
        </dialog>
    )
        
    
};





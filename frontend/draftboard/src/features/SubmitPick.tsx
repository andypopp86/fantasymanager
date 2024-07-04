import React, { useState, useRef, useEffect } from 'react';

type SubmitPickProps = {
    managers: any,
    player: any,
    openDialog: boolean,
    setOpenDialog: any,
}
export default function SubmitPick({ managers, player, setOpenDialog, openDialog }: SubmitPickProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [price, setPrice] = useState('');
    const [manager, setManager] = useState('');

    const handlePriceChange = (e) => {
        setPrice(e.target.value);
    };

    const handleManagerChange = (e) => {
        setManager(e.target.value);
    };

    useEffect(() => {
        const openModal = () => {
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
                onClick={() => dialogRef.current?.close()}
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
                value={manager}
                onChange={handleManagerChange}
            >
                {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                    {manager.name}
                    </option>
                ))}
            </select>
            </div>
            <div className="flex justify-end">
            <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mr-2">
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





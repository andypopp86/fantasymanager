import React, { useState, useRef, useEffect } from 'react';
import PlanChanges from './PlanChanges';

type PlanChangesModalProps = {
    setIsPlanChangesModalOpen: any,
    isPlanChangesModalOpen: boolean,
    draftContext: any,
}
export default function PlanChangesModal({ setIsPlanChangesModalOpen, isPlanChangesModalOpen, draftContext }: PlanChangesModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const openModal = () => {
            dialogRef.current?.showModal();
        };
        const closeModal = () => {
            dialogRef.current?.close();
        }
        (isPlanChangesModalOpen) ? openModal() : closeModal();
    }, [isPlanChangesModalOpen]);

    const closeModal = () => {
        setIsPlanChangesModalOpen(false);
    }

    return (
        <dialog
        ref={dialogRef}
        onClose={() => closeModal()}
        style={{position: "absolute", top: "0", left: "0", right: "0", bottom: "0", backgroundColor: "rgba(0,0,0,0.5)"}}>
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
        <div className={`bg-white rounded-lg p-8 max-w-lg w-full`}>
            <div className="flex justify-between items-center mb-4">
            <button
                className="text-gray-500 hover:text-gray-700 focus:outline-none"
                onClick={() => closeModal()}
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
            <PlanChanges draftContext={draftContext} />
            <div className="flex justify-end">
            <button className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md" onClick={() => closeModal()}>
                Close
            </button>
            </div>
        </div>
        </div>
        </dialog>
    )
        
    
};





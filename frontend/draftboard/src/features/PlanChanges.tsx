import React, { useState, useRef, useEffect } from 'react';

type PlanChangesModalProps = {
    draftContext: any,
}
export default function PlanChangesModal({ draftContext }: PlanChangesModalProps) {
    draftContext.planChanges.map((change) => {
        console.log(change)
    })
    return (
        <ul>
            {draftContext.planChanges.map((change) => (
                <li>{`${change.newPlayer.name} (${change.newPlayer.price}) - replaced - ${change.oldPlayer.player_name} (${change.oldPlayer.projected_price})`}</li>
            ))}

        </ul>
    )
        
    
};





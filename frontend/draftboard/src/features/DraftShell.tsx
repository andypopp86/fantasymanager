import React, { ReactNode, lazy, useState } from "react";
import { DraftDashboard } from "./DraftDashboard";
import { Draft } from "./Draft";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useActor } from "@xstate/react";
import { createActor } from "xstate";
import { appStateMachine } from "../state_machines/appStateMachine";

const FIVE_MINUTES = 1000 * 6 * 5

// this was doing a lazy import of Draft but was failing for a reason I did not want to dive into


export const DraftApp = () => {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: { queries: { staleTime: FIVE_MINUTES }}
            })
    )
    // const draftAppActor = useActor(appStateMachine);

    // const [, contextSend, contextMachine] = useActor(appStateMachine);
    // console.log(contextMachine)
    return (
        <QueryClientProvider client={queryClient}>
            <DraftDashboard />
            {/* <Router>
                <Routes>
                    <Route path="/draft/react_draft_entrypoint/" element={<DraftDashboard contextMachineRef={contextMachine} send={contextSend} />} />
                    <Route path="/drafts/:draft_id" element={<Draft contextMachineRef={contextMachine} />} />
                </Routes>
            </Router> */}
        </QueryClientProvider>
    )
}

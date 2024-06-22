import React, { ReactNode, lazy, useState } from "react";
import { DraftDashboard } from "./DraftDashboard";
import { Draft } from "./Draft";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const FIVE_MINUTES = 1000 * 6 * 5

// this was doing a lazy import of Draft but was failing for a reason I did not want to dive into


export const DraftApp = () => {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: { queries: { staleTime: FIVE_MINUTES }}
            })
    )
    return (
        <QueryClientProvider client={queryClient}>
            <Router>
                <Routes>
                    <Route path="/draft/react_draft_entrypoint/" element={<DraftDashboard />} />
                    <Route path="/drafts/:draft_id" element={<Draft />} />
                </Routes>
            </Router>
        </QueryClientProvider>
    )
}

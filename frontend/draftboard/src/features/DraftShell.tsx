import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DraftDashboard } from "./DraftDashboard";
import DraftCreatePage from "./DraftCreatePage";
import DraftPage from "./DraftPage";
import DraftPlanPage from "./DraftPlanPage";

const FIVE_MINUTES = 1000 * 6 * 5

// Django serves this SPA for every path under /app/ (see fantasy/urls.py), so
// the router owns everything below that base.
export const DraftApp = () => {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: { queries: { staleTime: FIVE_MINUTES }}
            })
    )
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter basename="/app">
                <Routes>
                    <Route path="/" element={<DraftDashboard />} />
                    <Route path="/draft/create" element={<DraftCreatePage />} />
                    <Route path="/draft/:draftId" element={<DraftPage />} />
                    <Route path="/draft/:draftId/plan" element={<DraftPlanPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </QueryClientProvider>
    )
}

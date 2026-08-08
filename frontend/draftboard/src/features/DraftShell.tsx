import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { DraftDashboard } from "./DraftDashboard";
import DraftCreatePage from "./DraftCreatePage";
import DraftPage from "./DraftPage";
import DraftPlanPage from "./DraftPlanPage";
import TargetTiersPage from "./TargetTiersPage";
import SpectatorBoard from "./SpectatorBoard";
import { meRetrieve } from "../lib/data";

const FIVE_MINUTES = 1000 * 6 * 5

// Django serves this SPA for every path under /app/ (see fantasy/urls.py), so
// the router owns everything below that base.
//
// Routes are role-gated: staff accounts (the drafter) get the full app,
// spectator accounts get only the dashboard and read-only board. The server
// enforces the same boundary via IsDrafter on the API — this gating is UX,
// not security.
const RoutedApp = () => {
    const { data: me } = useQuery({
        queryKey: ["me"],
        queryFn: () => meRetrieve(),
        select: (data) => data.data,
    })
    if (!me) return null;
    return (
        <BrowserRouter basename="/app">
            <Routes>
                <Route path="/" element={<DraftDashboard me={me} />} />
                {me.is_staff && (
                    <>
                        <Route path="/draft/create" element={<DraftCreatePage />} />
                        <Route path="/draft/:draftId" element={<DraftPage />} />
                        <Route path="/draft/:draftId/plan" element={<DraftPlanPage />} />
                        <Route path="/draft/:draftId/tiers" element={<TargetTiersPage />} />
                    </>
                )}
                <Route path="/board/:draftId" element={<SpectatorBoard />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    )
}

export const DraftApp = () => {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: { queries: { staleTime: FIVE_MINUTES }}
            })
    )
    return (
        <QueryClientProvider client={queryClient}>
            <RoutedApp />
        </QueryClientProvider>
    )
}

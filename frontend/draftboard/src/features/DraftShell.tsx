import React, { useState } from "react";
import { DraftDashboard } from "./DraftDashboard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const FIVE_MINUTES = 1000 * 6 * 5


export const DraftApp = () => {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: { queries: { staleTime: FIVE_MINUTES }}
            })
    )
    return (
        <QueryClientProvider client={queryClient}>
            <DraftDashboard />
        </QueryClientProvider>
    )
}

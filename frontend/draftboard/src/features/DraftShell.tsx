import React, { ReactNode, lazy, useState } from "react";
import { Draft } from "./Draft";
import { Router } from "@reach/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const FIVE_MINUTES = 1000 * 6 * 5

// this was doing a lazy import of Draft but was failing for a reason I did not want to dive into

type DraftShellProps = { children: ReactNode };

export const DraftShell = ({ children }: DraftShellProps) => {
    return (
        <div>{children}</div>
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
        <DraftShell>
            <QueryClientProvider client={queryClient}>
                <Router>
                    <Draft path="draft/react_draft_entrypoint"/>
                </Router>
            </QueryClientProvider>
        </DraftShell>
    )
}

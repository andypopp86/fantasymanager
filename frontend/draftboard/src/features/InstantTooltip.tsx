import React from "react";

type InstantTooltipProps = {
    label: string,
    children: React.ReactNode,
    className?: string,
};

// A tooltip that appears the moment you hover, unlike the browser's native
// `title` — which sits on a ~1s OS-level delay you can't configure, long enough
// to be useless mid-bid.
//
// CSS-only (Tailwind `group` + `group-hover`), with no transition, so there's no
// JS timer and nothing to get stuck open. Hover-only by nature: touch devices
// won't show it, which is fine for a marker whose meaning the drafter already
// knows.
export default function InstantTooltip({ label, children, className }: InstantTooltipProps) {
    return (
        <span className={"relative inline-flex group " + (className || "")}>
            {children}
            {/* Above the trigger. It overhangs the top of the nomination card,
                which is fine — no ancestor clips it, and the dark pill reads
                clearly over whatever it covers. */}
            <span
                role="tooltip"
                className="hidden group-hover:block pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50
                           whitespace-nowrap rounded bg-gray-900 text-white text-xs font-semibold px-2 py-1 shadow-lg"
            >
                {label}
            </span>
        </span>
    );
}

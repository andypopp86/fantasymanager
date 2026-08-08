import { useEffect, useState } from "react";

// Below Tailwind's `lg` breakpoint the desktop draft layout (three sidebar
// panels beside the board) has nowhere to go, so components swap in a
// one-panel-at-a-time / horizontally-scrolling arrangement instead. Kept as a
// JS media query rather than `lg:hidden` so we render ONE tree — two trees
// would mean two AvailablePlayers with independent filter state.
const MOBILE_QUERY = "(max-width: 1023px)";

export const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

    useEffect(() => {
        const query = window.matchMedia(MOBILE_QUERY);
        const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        setIsMobile(query.matches);
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);

    return isMobile;
};

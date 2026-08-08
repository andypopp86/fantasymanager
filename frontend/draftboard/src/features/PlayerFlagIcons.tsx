import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilm, faFlag, faUserInjured } from "@fortawesome/free-solid-svg-icons";
import InstantTooltip from "./InstantTooltip";
import type { PlayerDetail } from "../lib/draft.schemas";

type FlagSpec = {
    key: string,
    icon: any,
    color: string,
    label: string,
    // A predicate rather than a field name, so an enum field can drive several
    // differently-coloured icons (coaching) alongside plain booleans.
    active: (player: PlayerDetail) => boolean,
};

// Colour carries the VERDICT, the icon carries the subject — so a glance at the
// nomination area reads as "how many red marks", with green only where something
// counts in the player's favour. Every flag uses one of these two.
const BAD = "#dc2626";
const GOOD = "#16a34a";

// Hand-set flags on Player, shown as icons when a player is nominated so the
// drafter doesn't misprice a bid.
//
// THE place to add another: one entry here, plus the field on the model, the
// admin (list_display / list_editable / list_filter / fields) and the player
// serializer.
const PLAYER_FLAGS: FlagSpec[] = [
    // Priced on projected role/health rather than delivered production.
    { key: "projection", icon: faFilm, color: BAD, label: "Projection",
        active: (player) => !!player.is_projection },
    // Carrying an injury worth pricing in.
    { key: "injury", icon: faUserInjured, color: BAD, label: "Injury",
        active: (player) => !!player.has_injury },
    // Scheme/staff helping or hurting what they'd otherwise produce. Read
    // through the TEAM — coaching is a property of the staff, so it's set once
    // per team and every player on the roster inherits it. Null (or no team at
    // all) means no view and draws nothing. FontAwesome free has no referee or
    // whistle icon (both Pro), so faFlag stands in — the penalty flag is the
    // referee's signature, and it reads either way in red or green.
    { key: "coaching-bad", icon: faFlag, color: BAD, label: "Bad coaching",
        active: (player) => player.team?.coaching_impact === "bad" },
    { key: "coaching-good", icon: faFlag, color: GOOD, label: "Good coaching",
        active: (player) => player.team?.coaching_impact === "good" },
];

type PlayerFlagIconsProps = {
    // Pass the LIVE row's player where one is available, so flipping a flag in
    // /admin shows up on the next refetch instead of waiting for a re-nomination.
    player: PlayerDetail | null | undefined,
    size?: "1x" | "lg" | "2x",
    className?: string,
};

export default function PlayerFlagIcons({ player, size = "1x", className }: PlayerFlagIconsProps) {
    if (!player) return null;
    const active = PLAYER_FLAGS.filter((flag) => flag.active(player));
    if (active.length === 0) return null;

    return (
        <span className={"inline-flex items-center gap-2 " + (className || "")}>
            {active.map(({ key, icon, color, label }) => (
                <InstantTooltip key={key} label={label}>
                    <FontAwesomeIcon icon={icon} size={size} color={color} />
                </InstantTooltip>
            ))}
        </span>
    );
}

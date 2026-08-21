export const POSITION_BG_COLORS = {
    "RB": "blue",
    "WR": "green",
    "QB": "red",
    "TE": "orange",
    "DEF": "brown",
}
export const POSITION_FG_COLORS = {
    "RB": "white",
    "WR": "white",
    "QB": "white",
    "TE": "white",
    "DEF": "white",
}

export const getBudgetPerSlotColors = (value: number) => {
    if (value <= 1) return { backgroundColor: "#ff0000", color: "white" };
    if (value < 2) return { backgroundColor: "orangered", color: "white" };
    if (value <= 5) return { backgroundColor: "yellow", color: "black" };
    return { backgroundColor: "green", color: "white" };
}

// Hand-scored risk, 1-10, HIGHER = RISKIER. 0 = not reviewed, which gets NO
// fill at all — silence is not "safe" — so callers check for 0 before asking.
//
// Three anchors mixed linearly: BRIGHT green at 1, near-black at 5, BRIGHT red
// at 10. Lightness therefore dips in the middle, and that is the point — it
// gives the scale a second dimension besides hue, so 4/5/6 are told apart by
// being darker rather than by a hue difference too subtle to read in a small
// cell. A first pass ramped between dark green-700 and dark red-700 instead;
// the whole low end came out near-black, and on the player list (whose WR rows
// are already green) a low score visually merged into its own row.
//
// The neutral is zinc-900 rather than pure #000, and stays DARK rather than
// pale: in the player list the unscored cells are white, so a pale neutral
// would read as "not scored" at a glance — the opposite of what a 5 means.
const RISK_LOW = [34, 197, 94];   // green-500
const RISK_MID = [24, 24, 27];    // zinc-900 — the near-black neutral
const RISK_HIGH = [220, 38, 38];  // red-600

const mixChannels = (from: number[], to: number[], ratio: number) =>
    from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio));

const channelLuminance = (channel: number) => {
    const ratio = channel / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4);
};

// Text colour follows the fill instead of being fixed, because the ramp spans
// bright green through near-black: 0.179 relative luminance is where black and
// white text cross over on contrast (WCAG), so this always picks the more
// readable of the two.
const readableTextOn = ([red, green, blue]: number[]) => {
    const luminance = 0.2126 * channelLuminance(red)
        + 0.7152 * channelLuminance(green)
        + 0.0722 * channelLuminance(blue);
    return luminance > 0.179 ? "black" : "white";
};

export const getRiskColors = (score: number) => {
    const clamped = Math.min(Math.max(score, 1), 10);
    const fill = clamped <= 5
        ? mixChannels(RISK_LOW, RISK_MID, (clamped - 1) / 4)
        : mixChannels(RISK_MID, RISK_HIGH, (clamped - 5) / 5);
    return { backgroundColor: `rgb(${fill.join(", ")})`, color: readableTextOn(fill) };
}

export const MANAGER_BG_COLORS = [
    "red", "blue", "green", "orange", "purple", "grey", "yellow", "Goldenrod", "DodgerBlue", "IndianRed", "MediumPurple"
]
export const MANAGER_FG_COLORS = [
    "white", "white", "white", "white", "white", "white", "black", "white", "white", "white", "white"
]
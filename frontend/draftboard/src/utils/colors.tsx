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

// Hand-scored risk, 1-10, HIGHER = RISKIER (0 = not reviewed, and gets no
// badge at all — silence is not "safe"). Same escalation as
// getBudgetPerSlotColors, read in the other direction.
export const getRiskColors = (score: number) => {
    if (score >= 9) return { backgroundColor: "#7f1d1d", color: "white" };
    if (score >= 7) return { backgroundColor: "#dc2626", color: "white" };
    if (score >= 4) return { backgroundColor: "#f59e0b", color: "black" };
    return { backgroundColor: "#16a34a", color: "white" };
}

export const MANAGER_BG_COLORS = [
    "red", "blue", "green", "orange", "purple", "grey", "yellow", "Goldenrod", "DodgerBlue", "IndianRed", "MediumPurple"
]
export const MANAGER_FG_COLORS = [
    "white", "white", "white", "white", "white", "white", "black", "white", "white", "white", "white"
]
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

export const MANAGER_BG_COLORS = [
    "red", "blue", "green", "orange", "purple", "grey", "yellow", "Goldenrod", "DodgerBlue", "IndianRed", "MediumPurple"
]
export const MANAGER_FG_COLORS = [
    "white", "white", "white", "white", "white", "white", "black", "white", "white", "white", "white"
]
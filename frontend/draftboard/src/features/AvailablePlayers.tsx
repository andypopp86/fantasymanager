import React, { useEffect } from "react";
import AvailablePlayer from "./AvailablePlayer.tsx";
import { useState } from "react";
import { useIsMobile } from "../hooks/useIsMobile";

export const AvailablePlayers = ({draftContext, draftSend}) => {
    // On a phone the filter form would push the player list off-screen, so it
    // starts collapsed behind a toggle there and stays open on desktop.
    const isMobile = useIsMobile();
    const [showFilters, setShowFilters] = useState(!isMobile);
    const nominatePlayer = (player) => {
        draftSend({ type: 'nominate_player', player });
    }
    const handleDragStart = (e, id) => {
        const draggedPlayer = draftContext.undraftedPlayers.find((player) => player.player.player_id === id);
        draftSend({
            type: 'drag_player',
            player: draggedPlayer,
        });
    }
    const [statField, setStatField] = useState("projected_price");
    const [statAbbreviation, setStatAbbreviation] = useState("$");
    const [nameFilterValue, setNameFilterValue] = useState("");
    const [positionFilterValue, setPositionFilterValue] = useState("");
    const [teamFilterValue, setTeamFilterValue] = useState("");
    const [priceFilterValue, setPriceFilterValue] = useState(undefined);
    const [budgetedFilterValue, setBudgetedFilterValue] = useState("off");
    const [favoriteFilterValue, setFavoriteFilterValue] = useState("off");
    // "" | "above" | "below" | "equal" — my_price against the projected price.
    const [priceVarFilterValue, setPriceVarFilterValue] = useState("");
    // years_experience: a mode ("eq" | "lte") plus a value. Kept as a separate
    // pair rather than folded into the price-style ceiling because 0 is a
    // MEANINGFUL value here (a rookie, or a player not filled in yet) — so an
    // empty VALUE is what turns the filter off, not a zero.
    const [expModeFilterValue, setExpModeFilterValue] = useState("eq");
    const [expFilterValue, setExpFilterValue] = useState("");
    const [filteredPlayers, setFilteredPlayers] = useState(draftContext.undraftedPlayers);

    const checkName = (player) => {
        return player.player.name.toLowerCase().includes(nameFilterValue.trim().toLowerCase());
    }
    const checkPosition = (player) => {
        return player.player.position.toLowerCase().includes(positionFilterValue.toLowerCase());
    }
    const checkTeam = (player) => {
        return player.player.team?.code === teamFilterValue;
    }
    const checkPrice = (player) => {
        return player.projected_price <= priceFilterValue;
    }
    const checkBudget = (player) => {
        return budgetedPlayerIds.includes(player.player.player_id);
    }
    // Compares against the ROW's projected_price — the server-annotated
    // `override_price || projected_price`, the same basis the nomination area
    // colours my_price against. A player with no my_price can't be compared, so
    // they drop out whenever a variance option is selected.
    const checkPriceVariance = (player) => {
        const raw = player.player.my_price;
        if (raw === null || raw === undefined || raw === "") return false;
        const mine = parseInt(String(raw)) || 0;
        const projected = parseInt(String(player.projected_price)) || 0;
        if (priceVarFilterValue === "above") return mine > projected;
        if (priceVarFilterValue === "below") return mine < projected;
        return mine === projected;
    }
    const checkFavorite = (player) => {
        return !!player.player.favorite;
    }
    const checkExperience = (player) => {
        const years = parseInt(String(player.player.years_experience ?? 0)) || 0;
        const target = parseInt(expFilterValue);
        return expModeFilterValue === "lte" ? years <= target : years === target;
    }
    const budgetedPlayerIds = Object.keys(draftContext.budgetedPlayers).map((slot) => {
        const budgetedPlayerId = draftContext.budgetedPlayers[slot].pick.player_id;
        return budgetedPlayerId ;
    });
    // Options come from the loaded players (not a hardcoded list), so the
    // dropdown stays empty until the year's players have teams linked and
    // never offers a team with no available players.
    const teamCodes = [...new Set(
        draftContext.undraftedPlayers
            .map((player) => player.player.team?.code)
            .filter(Boolean)
    )].sort() as string[];
    const handleFilterChange = () => {
        const predicates = [];
        if (nameFilterValue !== "") { predicates.push(checkName); }
        if (positionFilterValue !== "") { predicates.push(checkPosition); }
        if (teamFilterValue !== "") { predicates.push(checkTeam); }
        if (priceFilterValue !== undefined && priceFilterValue > 0) { predicates.push(checkPrice); }
        if (budgetedFilterValue === "on") { predicates.push(checkBudget); }
        if (favoriteFilterValue === "on") { predicates.push(checkFavorite); }
        if (priceVarFilterValue !== "") { predicates.push(checkPriceVariance); }
        if (expFilterValue !== "" && !isNaN(parseInt(expFilterValue))) { predicates.push(checkExperience); }
        if (predicates.length === 0) {
            setFilteredPlayers(draftContext.undraftedPlayers);
            return;
        }
        const filtered = draftContext.undraftedPlayers.filter((player) => {
            return predicates.every((predicate) => predicate(player));
        });
        setFilteredPlayers(filtered);
    }

    // Stored raw (trimmed only when filtering) so typing spaces isn't fought
    // by the controlled input.
    const handleNameFilterChange = (filterValue) => {
        setNameFilterValue(filterValue);
    }
    const handlePriceFilterChange = (filterValue) => {
        const floatValue = parseFloat(filterValue);
        setPriceFilterValue(Number.isNaN(floatValue) ? undefined : floatValue);
    }
    const handleBudgetedFilterChange = (filterValue) => {
        const newValue = filterValue === "on" ? "off" : "on";
        setBudgetedFilterValue(newValue);
    }
    const handleFavoriteFilterChange = (filterValue) => {
        const newValue = filterValue === "on" ? "off" : "on";
        setFavoriteFilterValue(newValue);
    }
    const handlePriceVarFilterChange = (filterValue) => {
        setPriceVarFilterValue(filterValue);
    }

    // Resets every filter input (they're all controlled) and the results.
    const clearFilter = () => {
        setNameFilterValue("");
        setPositionFilterValue("");
        setTeamFilterValue("");
        setPriceFilterValue(undefined);
        setBudgetedFilterValue("off");
        setFavoriteFilterValue("off");
        setPriceVarFilterValue("");
        setExpModeFilterValue("eq");
        setExpFilterValue("");
        setFilteredPlayers(draftContext.undraftedPlayers);
    }

    const handleFilterKeyDown = (e) => {
        if (e.key === "Enter") {
            handleFilterChange();
        }
    }

    // The player list changes on every pick (and refetch); re-apply the active
    // filters instead of resetting, so results stay filtered until Clear.
    useEffect(() => {
        handleFilterChange();
    }, [draftContext.undraftedPlayers]);

    const handleStatChange = () => {
        const ABBREV_NAMES = {
            "projected_price": "$",
            "points": "PTS",
            "yards": "YDS",
            "tds": "TD",
            "first_downs": "1D",
            "rush_attempts": "RUSH",
            "receptions": "REC",
            "targets": "TGT"
        }
        const stat = document.getElementById("stat") as HTMLSelectElement;
        const statValue = stat.value;
        const sortedPlayers = filteredPlayers.sort((a, b) => {
            return parseFloat(b[statValue]) - parseFloat(a[statValue]);
        });
        setStatField(statValue);
        setStatAbbreviation(ABBREV_NAMES[statValue]);
        setFilteredPlayers(sortedPlayers);
    }
    return (
        <div>
            <div className="component-header flex items-center justify-between gap-2">
                <span>Available Players</span>
                {isMobile && (
                    <button
                        className="border border-gray-400 rounded px-2 py-0.5 text-xs font-normal hover:bg-gray-100"
                        onClick={() => setShowFilters((shown) => !shown)}
                    >
                        {showFilters ? "Hide filters ▴" : "Filters ▾"}
                    </button>
                )}
            </div>
            {showFilters && (
            <table className="table">
                <tbody>
                    <tr>
                        <td scope="row">Name:</td>
                        <td><input type="text" style={{width: "100px"}}
                            value={nameFilterValue}
                            onChange={(e) => handleNameFilterChange(e.target.value)}
                            onKeyDown={handleFilterKeyDown} />
                        </td>
                    </tr>
                    <tr>
                        <td scope="row">Position:</td>
                        <td>
                            <select style={{width: "100px"}} value={positionFilterValue}
                                onChange={(e) => setPositionFilterValue(e.target.value)}>
                                <option value="">All</option>
                                <option value="QB">QB</option>
                                <option value="RB">RB</option>
                                <option value="WR">WR</option>
                                <option value="TE">TE</option>
                                <option value="DEF">DEF</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <td scope="row">Team:</td>
                        <td>
                            <select style={{width: "100px"}} value={teamFilterValue}
                                onChange={(e) => setTeamFilterValue(e.target.value)}>
                                <option value="">All</option>
                                {teamCodes.map((code) => (
                                    <option key={code} value={code}>{code}</option>
                                ))}
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <td scope="row">Price:</td>
                        <td><input type="number" style={{width: "100px"}}
                        className="py-1 px-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                        value={priceFilterValue ?? ""}
                        onChange={(e) => handlePriceFilterChange(e.target.value)}
                        onKeyDown={handleFilterKeyDown} /></td>
                    </tr>
                    <tr>
                        <td scope="row">Budgeted:</td>
                        <td>
                            <input type="checkbox" style={{width: "100px"}} checked={budgetedFilterValue === "on"}
                            onChange={(e) => handleBudgetedFilterChange(budgetedFilterValue)} />
                        </td>
                    </tr>
                    <tr>
                        <td scope="row">Favorite:</td>
                        <td>
                            <input type="checkbox" style={{width: "100px"}} checked={favoriteFilterValue === "on"}
                            onChange={(e) => handleFavoriteFilterChange(favoriteFilterValue)} />
                        </td>
                    </tr>
                    <tr>
                        <td scope="row">My $:</td>
                        <td>
                            <select style={{width: "100px"}} value={priceVarFilterValue}
                                onChange={(e) => handlePriceVarFilterChange(e.target.value)}>
                                <option value="">All</option>
                                <option value="above">Above proj</option>
                                <option value="below">Below proj</option>
                                <option value="equal">Equal</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <td scope="row">Exp:</td>
                        <td>
                            <select style={{width: "44px"}} value={expModeFilterValue}
                                onChange={(e) => setExpModeFilterValue(e.target.value)}
                                title="Exactly, or at most, this many years">
                                <option value="eq">=</option>
                                <option value="lte">&le;</option>
                            </select>
                            <input type="number" min="0" style={{width: "52px"}}
                                className="ml-1 py-1 px-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                                placeholder="any"
                                value={expFilterValue}
                                onChange={(e) => setExpFilterValue(e.target.value)}
                                onKeyDown={handleFilterKeyDown} />
                        </td>
                    </tr>
                    <tr>
                    <td><button className={"px-2 py-1 bg-blue-500 text-white rounded-md shadow-md hover:bg-blue-600"} onClick={handleFilterChange}>Filter</button></td>
                    <td><button className={"px-2 py-1 bg-gray-300 text-gray-800 rounded-md shadow-md hover:bg-gray-400"} onClick={clearFilter}>Clear</button></td>
                    </tr>
                    <tr>
                        <td>
                            <select name="stat" id="stat" onChange={() => handleStatChange()}>
                                <option value="projected_price">Price</option>
                                <option value="points">Points</option>
                                <option value="yards">Yards</option>
                                <option value="tds">TD</option>
                                <option value="first_downs">1st Down</option>
                                <option value="rush_attempts">Rush</option>
                                <option value="receptions">Rec</option>
                                <option value="targets">Targets</option>
                            </select>
                        </td>
                    </tr>
                </tbody>
            </table>
            )}
            <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full lg:w-auto">
                <thead className="sticky top-0 bg-white z-10">
                    <tr className="component-subheader">
                        <th>Player Name</th>
                        <th>Position</th>
                        <th>Pos$</th>
                        {/* Unused for the 2026 draft; matching cells are commented out in AvailablePlayer.tsx
                        <th>Adp$</th>
                        <th>Diff$</th>
                        <th>Schd</th>
                        <th>{statAbbreviation}</th>
                        */}
                    </tr>
                </thead>
                <tbody>
                    {filteredPlayers && filteredPlayers?.map((pick) => (
                        <AvailablePlayer
                            key={pick.player.player_id}
                            pick={pick}
                            nominatePlayer={nominatePlayer}
                            handleDragStart={handleDragStart}
                            id={pick.player.id}
                            draftContext={draftContext}
                            draftSend={draftSend}
                            statField={statField}
                        />
                    ))}
                </tbody>
            </table>
            </div>
        </div>
    )
}
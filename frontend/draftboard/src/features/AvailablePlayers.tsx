import React, { useEffect } from "react";
import AvailablePlayer from "./AvailablePlayer.tsx";
import { useState } from "react";

export const AvailablePlayers = ({draftContext, draftSend}) => {
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
    const [priceFilterValue, setPriceFilterValue] = useState(undefined);
    const [budgetedFilterValue, setBudgetedFilterValue] = useState("off");
    const [favoriteFilterValue, setFavoriteFilterValue] = useState("off");
    const [targetTypeFilterValue, setTargetTypeFilterValue] = useState("");
    const [filteredPlayers, setFilteredPlayers] = useState(draftContext.undraftedPlayers);

    const checkName = (player) => {
        return player.player.name.toLowerCase().includes(nameFilterValue.trim().toLowerCase());
    }
    const checkPosition = (player) => {
        return player.player.position.toLowerCase().includes(positionFilterValue.toLowerCase());
    }
    const checkPrice = (player) => {
        return player.projected_price <= priceFilterValue;
    }
    const checkBudget = (player) => {
        return budgetedPlayerIds.includes(player.player.player_id);
    }
    const checkTargetType = (player) => {
        return player.player.target_type === targetTypeFilterValue;
    }
    const checkFavorite = (player) => {
        return !!player.player.favorite;
    }
    const budgetedPlayerIds = Object.keys(draftContext.budgetedPlayers).map((slot) => {
        const budgetedPlayerId = draftContext.budgetedPlayers[slot].pick.player_id;
        return budgetedPlayerId ;
    });
    const handleFilterChange = () => {
        const predicates = [];
        if (nameFilterValue !== "") { predicates.push(checkName); }
        if (positionFilterValue !== "") { predicates.push(checkPosition); }
        if (priceFilterValue !== undefined && priceFilterValue > 0) { predicates.push(checkPrice); }
        if (budgetedFilterValue === "on") { predicates.push(checkBudget); }
        if (favoriteFilterValue === "on") { predicates.push(checkFavorite); }
        if (targetTypeFilterValue !== "") { predicates.push(checkTargetType); }
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
    const handleTargetTypeFilterChange = (filterValue) => {
        setTargetTypeFilterValue(filterValue);
    }

    // Resets every filter input (they're all controlled) and the results.
    const clearFilter = () => {
        setNameFilterValue("");
        setPositionFilterValue("");
        setPriceFilterValue(undefined);
        setBudgetedFilterValue("off");
        setFavoriteFilterValue("off");
        setTargetTypeFilterValue("");
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
            <div className="component-header">Available Players</div>
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
                        <td scope="row">Target:</td>
                        <td>
                            <select style={{width: "100px"}} value={targetTypeFilterValue}
                                onChange={(e) => handleTargetTypeFilterChange(e.target.value)}>
                                <option value="">All</option>
                                <option value="prime">Prime</option>
                                <option value="starter">Starter</option>
                                <option value="streamer">Streamer</option>
                                <option value="sleeper">Sleeper</option>
                                <option value="catalyst">Catalyst</option>
                                <option value="undraftable">Undraftable</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                    <td><button className={"px-1 py-0 bg-blue-500 text-white rounded-md shadow-md hover:bg-blue-600"} onClick={handleFilterChange}>Filter</button></td>
                    <td><button className={"px-1 py-0 bg-gray-300 text-gray-800 rounded-md shadow-md hover:bg-gray-400"} onClick={clearFilter}>Clear</button></td>
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
            <div className="max-h-[70vh] overflow-y-auto">
            <table>
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
import React, { useEffect } from "react";
import AvailablePlayer from "./AvailablePlayer.tsx";
import { useState } from "react";
import SubmitPick from "./SubmitPick.tsx";

export const AvailablePlayers = ({draftContext, draftSend}) => {
    const [nominatedPlayer, setNominatedPlayer] = useState(draftContext.undraftedPlayers![0].player || null);
    const [openDialog, setOpenDialog] = useState(false);
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
    const [filteredPlayers, setFilteredPlayers] = useState(draftContext.undraftedPlayers);

    useEffect(() => {
        setFilteredPlayers(draftContext.undraftedPlayers);
    }, [draftContext.undraftedPlayers]);
    
    const checkName = (player) => {
        return player.player.name.toLowerCase().includes(nameFilterValue.toLowerCase());
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
        if (predicates.length === 0) {
            setFilteredPlayers(draftContext.undraftedPlayers);
            return;
        }
        const filtered = draftContext.undraftedPlayers.filter((player) => {
            return predicates.every((predicate) => predicate(player));
        });
        setFilteredPlayers(filtered);
    }

    const handleNameFilterChange = (filterValue) => {
        setNameFilterValue(filterValue.trim());
    }
    const handlePositionFilterChange = (filterValue) => {
        const cleanedValue = filterValue.trim().toUpperCase();
        if (["QB", "RB", "WR", "TE", "K", "DEF"].includes(cleanedValue)) {
            setPositionFilterValue(cleanedValue);
        } else {
            setPositionFilterValue("");
        }
    }
    const handlePriceFilterChange = (filterValue) => {
        const floatValue = parseFloat(filterValue);
        setPriceFilterValue(floatValue || 0);
    }
    const handleBudgetedFilterChange = (filterValue) => {
        const newValue = filterValue === "on" ? "off" : "on";
        setBudgetedFilterValue(newValue);
    }

    const clearFilter = () => {
        setNameFilterValue("");
        setPositionFilterValue("");
        setPriceFilterValue(0.00);
        setBudgetedFilterValue(undefined);
        setFilteredPlayers(draftContext.undraftedPlayers);
    }

    useEffect(() => {
        setFilteredPlayers(draftContext.undraftedPlayers);
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
                            onBlur={(e) => handleNameFilterChange(e.target.value)} />
                        </td>
                    </tr>
                    <tr>
                        <td scope="row">Position:</td>
                        <td><input type="text" style={{width: "100px"}}
                            onBlur={(e) => handlePositionFilterChange(e.target.value)} />
                        </td>
                    </tr>
                    <tr>
                        <td scope="row">Price:</td>
                        <td><input type="number" style={{width: "100px"}}
                        className="py-1 px-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                        onBlur={(e) => handlePriceFilterChange(e.target.value)} /></td>
                    </tr>
                    <tr>
                        <td scope="row">Budgeted:</td>
                        <td>
                            <input type="checkbox" style={{width: "100px"}} checked={budgetedFilterValue === "on"}
                            onChange={(e) => handleBudgetedFilterChange(budgetedFilterValue)} />
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
            <table>
                <thead>
                    <tr className="component-subheader">
                        <th>Player Name</th>
                        <th>Position</th>
                        <th>Pos$</th>
                        <th>Adp$</th>
                        <th>Diff$</th>
                        <th>Schd</th>
                        <th>{statAbbreviation}</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredPlayers && filteredPlayers?.map((pick) => (
                        <AvailablePlayer
                            key={pick.player.player_id}
                            pick={pick}
                            setOpenDialog={setOpenDialog}
                            setNominatedPlayer={setNominatedPlayer}
                            handleDragStart={handleDragStart}
                            id={pick.player.id}
                            draftContext={draftContext}
                            statField={statField}
                        />
                    ))}
                </tbody>
            </table>
            {openDialog && (
            <SubmitPick
                draftContext={draftContext}
                player={nominatedPlayer}
                openDialog={openDialog}
                setOpenDialog={setOpenDialog}
                draftSend={draftSend}
            />
            )}
        </div>
    )
}
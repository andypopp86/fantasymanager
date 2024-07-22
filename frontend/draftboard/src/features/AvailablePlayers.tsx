import React, { useEffect } from "react";
import AvailablePlayer from "./AvailablePlayer.tsx";
import { useState } from "react";
import SubmitPick from "./SubmitPick.tsx";

export const AvailablePlayers = ({draftContext, draftSend}) => {
    const [nominatedPlayer, setNominatedPlayer] = useState(draftContext.undraftedPlayers![0].player || null);
    const [openDialog, setOpenDialog] = useState(false);
    const handleDragStart = (e, id) => {
        draftSend({
            type: 'drag_player',
            player: draftContext.undraftedPlayers.find((player) => player.player.id === id),
        });
    }
    const [nameFilterValue, setNameFilterValue] = useState("");
    const [positionFilterValue, setPositionFilterValue] = useState("");
    const [priceFilterValue, setPriceFilterValue] = useState(undefined);
    const [filteredPlayers, setFilteredPlayers] = useState(draftContext.undraftedPlayers);

    const checkName = (player) => {
        return player.player.name.toLowerCase().includes(nameFilterValue.toLowerCase());
    }
    const checkPosition = (player) => {
        return player.player.position.toLowerCase().includes(positionFilterValue.toLowerCase());
    }
    const checkPrice = (player) => {
        return player.player.projected_price <= priceFilterValue;
    }
    const handleFilterChange = () => {
        const predicates = [];
        if (nameFilterValue !== "") { predicates.push(checkName); }
        if (positionFilterValue !== "") { predicates.push(checkPosition); }
        if (priceFilterValue !== 0) { predicates.push(checkPrice); }
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
    const clearFilter = () => {
        setNameFilterValue("");
        setPositionFilterValue("");
        setPriceFilterValue(0.00);
        setFilteredPlayers(draftContext.undraftedPlayers);
    }

    useEffect(() => {
        setFilteredPlayers(draftContext.undraftedPlayers);
    }, [draftContext.undraftedPlayers]);

    return (
        <div>
            <div style={{fontSize: "24px", fontWeight: "bold"}}>Available Players</div>
            <table className="table">
                <tbody>
                    <tr>
                        <td scope="row">Name:</td>
                        <td><input type="text" style={{width: "100px"}}
                            onBlur={(e) => handleNameFilterChange(e.target.value)} />
                        </td>
                        <td><button className={"px-1 py-0 bg-blue-500 text-white rounded-md shadow-md hover:bg-blue-600"} onClick={handleFilterChange}>Filter</button></td>
                    </tr>
                    <tr>
                        <td scope="row">Position:</td>
                        <td><input type="text" style={{width: "100px"}}
                            onBlur={(e) => handlePositionFilterChange(e.target.value)} />
                        </td>
                        <td><button className={"px-1 py-0 bg-gray-300 text-gray-800 rounded-md shadow-md hover:bg-gray-400"} onClick={clearFilter}>Clear</button></td>
                    </tr>
                    <tr>
                        <td scope="row">Price:</td>
                        <td><input type="number" style={{width: "100px"}}
                        className="py-1 px-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                        onBlur={(e) => handlePriceFilterChange(e.target.value)} /></td>
                    </tr>
                </tbody>
            </table>
            <table>
                <thead>
                    <tr>
                        <th>Player Name</th>
                        <th>Position</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredPlayers?.map((pick) => (
                        <AvailablePlayer
                            key={pick.player.id}
                            pick={pick}
                            setOpenDialog={setOpenDialog}
                            setNominatedPlayer={setNominatedPlayer}
                            handleDragStart={handleDragStart}
                            id={pick.player.id}
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
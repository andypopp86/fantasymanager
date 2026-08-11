import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    mockDraftRetrieve,
    mockDraftAvailablePlayersRetrieve,
    mockDraftSetPick,
    mockDraftClearSlot,
    mockDraftCreatePlan,
} from "../lib/data";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import type { MockDraftDetail, MockDraftPlayer } from "../lib/draft.schemas";

const POSITION_FILTERS = ["QB", "RB", "WR", "TE", "DEF"];

const priceOf = (player: MockDraftPlayer) => parseInt(String(player.projected_price)) || 1;

// /mocks/:mockId — fill a mock draft's roster from the player list, then save it
// as a DraftPlan.
//
// Interaction mirrors the board's tap-to-place path: pick a player, then click
// an eligible slot (empty ones are outlined blue, filled ones say "replace").
// Eligibility comes from each slot's own allowed_positions, so the client never
// sends a slot the server would reject.
//
// Reads/writes go straight to the server via React Query — no Dexie, no offline
// queue. This is prep-time work, and each write answers with the whole mock, so
// the response seeds the cache instead of triggering a refetch.
export default function MockDraftPage() {
    const { mockId: mockIdParam } = useParams();
    const mockId = Number(mockIdParam);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [selected, setSelected] = useState<MockDraftPlayer | null>(null);
    const [search, setSearch] = useState("");
    const [positionFilter, setPositionFilter] = useState<string | null>(null);
    // Same filter semantics as the board's AvailablePlayers: price is a CEILING
    // (max the pick may cost), team comes from the loaded players rather than a
    // hardcoded list, and Favorite counts only `true` — the tri-state's neutral
    // (null) and avoid (false) are both "not a favorite".
    const [maxPrice, setMaxPrice] = useState("");
    const [teamFilter, setTeamFilter] = useState("");
    const [favoriteOnly, setFavoriteOnly] = useState(false);
    const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
    const [savedPlan, setSavedPlan] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const mockKey = ["mock_draft", mockId];
    const playersKey = ["mock_draft_players", mockId];

    const { data: mock } = useQuery({
        queryKey: mockKey,
        queryFn: () => mockDraftRetrieve(mockId),
        select: (response) => response.data,
    });

    const { data: players } = useQuery({
        queryKey: playersKey,
        queryFn: () => mockDraftAvailablePlayersRetrieve(mockId),
        select: (response) => response.data,
    });

    // Every write returns the full mock, so seed the cache from it. The player
    // list changes too (picked players drop out, replaced ones come back), hence
    // the invalidate alongside.
    const applyDetail = (detail: MockDraftDetail) => {
        queryClient.setQueryData(mockKey, { data: detail });
        queryClient.invalidateQueries({ queryKey: playersKey });
        queryClient.invalidateQueries({ queryKey: ["mock_drafts"] });
    };

    const runWrite = (write: Promise<{ data: MockDraftDetail }>) => {
        setError(null);
        return write
            .then((response) => applyDetail(response.data))
            .catch((err) => setError(String(err?.response?.data?.[0] || err?.response?.data?.detail || err.message)));
    };

    const rows = useMemo(() => {
        if (!mock) return [];
        return Object.entries(mock.slots)
            .sort(([, a], [, b]) => a.order - b.order)
            .map(([slot, slotObj]) => ({
                slot,
                pick: slotObj.pick,
                eligible: !!selected && slotObj.allowed_positions.includes(selected.position),
            }));
    }, [mock, selected]);

    // Options come from the loaded players, so a team with nobody left available
    // never shows up in the dropdown.
    const teamCodes = useMemo(
        () => [...new Set((players || []).map((player) => player.team).filter(Boolean))].sort() as string[],
        [players],
    );

    const visiblePlayers = useMemo(() => {
        const term = search.trim().toLowerCase();
        const ceiling = parseFloat(maxPrice);
        return (players || []).filter((player) => {
            if (positionFilter && player.position !== positionFilter) return false;
            if (term && !player.name.toLowerCase().includes(term)) return false;
            if (teamFilter && player.team !== teamFilter) return false;
            if (!isNaN(ceiling) && ceiling > 0 && priceOf(player) > ceiling) return false;
            if (favoriteOnly && player.favorite !== true) return false;
            return true;
        });
    }, [players, search, positionFilter, teamFilter, maxPrice, favoriteOnly]);

    const filtersActive = !!(search || positionFilter || teamFilter || maxPrice || favoriteOnly);

    const clearFilters = () => {
        setSearch("");
        setPositionFilter(null);
        setTeamFilter("");
        setMaxPrice("");
        setFavoriteOnly(false);
    };

    const placeIn = (slot: string) => {
        if (!selected) return;
        const player = selected;
        setSelected(null);
        runWrite(mockDraftSetPick(mockId, player.player_id, { position_slot: slot, price: priceOf(player) }));
    };

    const clearSlot = (slot: string) => {
        setPriceDrafts((prev) => {
            const next = { ...prev };
            delete next[slot];
            return next;
        });
        runWrite(mockDraftClearSlot(mockId, { position_slot: slot }));
    };

    const commitPrice = (slot: string, playerId: number) => {
        const raw = priceDrafts[slot];
        if (raw === undefined) return;
        setPriceDrafts((prev) => {
            const next = { ...prev };
            delete next[slot];
            return next;
        });
        const price = parseInt(raw);
        if (isNaN(price) || price < 0) return;
        runWrite(mockDraftSetPick(mockId, playerId, { position_slot: slot, price }));
    };

    const saveAsPlan = () => {
        const name = window.prompt("Name for the plan built from this mock draft:", mock?.name || "");
        if (!name) return;
        setError(null);
        mockDraftCreatePlan(mockId, { name })
            .then(() => setSavedPlan(name))
            .catch((err) => setError(String(err?.response?.data?.detail || err.message)));
    };

    if (!mock) return null;

    const overBudget = mock.budget_remaining < 0;

    return (
        <div className="min-h-screen bg-gray-100 py-6 px-2 sm:px-4">
            <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">

                <div className="bg-green-200 px-4 py-3 flex items-center gap-3 flex-wrap">
                    <button
                        className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50 active:bg-gray-100 shadow-sm"
                        onClick={() => navigate("/")}
                    >
                        ← Dashboard
                    </button>
                    <div className="flex-1 text-center min-w-40">
                        <h1 className="text-xl font-bold text-gray-800">{mock.name}</h1>
                        <p className="text-sm text-gray-600">
                            Mock draft · {mock.year} · {mock.filled_slots}/{mock.total_slots} slots filled
                        </p>
                    </div>
                    <button
                        className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-md px-4 py-2 shadow-sm disabled:opacity-40"
                        title="Snapshot these slots as a reusable DraftPlan"
                        disabled={mock.filled_slots === 0}
                        onClick={saveAsPlan}
                    >
                        Save as plan
                    </button>
                </div>

                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-6 flex-wrap text-sm">
                    <div className="text-gray-600">
                        <span className="font-semibold text-gray-800">Spent:</span> ${mock.budget_spent} of ${mock.starting_budget}
                    </div>
                    <div className={overBudget ? "text-red-600 font-bold" : "text-gray-600"}>
                        <span className="font-semibold">{overBudget ? "Over budget:" : "Remaining:"}</span>{" "}
                        ${Math.abs(mock.budget_remaining)}
                    </div>
                    <span className="flex-1" />
                    {selected && (
                        <span className="text-blue-700 font-semibold">
                            Placing {selected.name} (${priceOf(selected)}) — click an eligible slot
                            <button className="ml-2 text-xs text-gray-500 underline" onClick={() => setSelected(null)}>cancel</button>
                        </span>
                    )}
                </div>

                {savedPlan && (
                    <p className="px-4 py-2 bg-green-100 text-sm text-green-800">
                        Plan “{savedPlan}” saved. Apply it from a draft’s Plans page.
                        <button className="ml-2 text-xs underline" onClick={() => setSavedPlan(null)}>dismiss</button>
                    </p>
                )}
                {error && (
                    <p className="px-4 py-2 bg-red-100 text-sm text-red-800">
                        {error}
                        <button className="ml-2 text-xs underline" onClick={() => setError(null)}>dismiss</button>
                    </p>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">

                    {/* Roster */}
                    <div className="border-r border-gray-200">
                        <h2 className="px-4 py-2 bg-gray-200 text-xs uppercase tracking-wide text-gray-600 font-semibold">Roster</h2>
                        <table className="w-full text-sm">
                            <tbody>
                                {rows.map(({ slot, pick, eligible }) => (
                                    <tr
                                        key={slot}
                                        className={
                                            "border-b border-gray-100 " +
                                            (eligible ? "cursor-pointer outline outline-2 -outline-offset-2 outline-blue-400 hover:bg-blue-50" : "hover:bg-gray-50")
                                        }
                                        onClick={eligible ? () => placeIn(slot) : undefined}
                                    >
                                        <td className="px-4 py-2 font-semibold text-gray-700 w-24">{slot}</td>
                                        <td className="px-2 py-2">
                                            {pick ? (
                                                <span
                                                    className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                                                    style={{ background: POSITION_BG_COLORS[pick.position], color: POSITION_FG_COLORS[pick.position] }}
                                                >
                                                    {pick.name}{pick.team ? ` · ${pick.team}` : ""}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300">{eligible ? "place here" : "—"}</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2 w-24 text-right">
                                            {pick && (
                                                <span className="inline-flex items-center gap-1">
                                                    $
                                                    <input
                                                        className="w-14 border border-gray-300 rounded px-1 py-0.5 text-right"
                                                        value={priceDrafts[slot] ?? String(pick.price)}
                                                        onClick={(event) => event.stopPropagation()}
                                                        onChange={(event) => setPriceDrafts((prev) => ({ ...prev, [slot]: event.target.value }))}
                                                        onBlur={() => commitPrice(slot, pick.player_id)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                                                        }}
                                                        title={`Market price $${parseInt(String(pick.projected_price)) || 0}`}
                                                    />
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 w-10 text-right">
                                            {pick && (
                                                <button
                                                    className="text-xs text-red-500 hover:text-red-700"
                                                    title="Empty this slot"
                                                    onClick={(event) => { event.stopPropagation(); clearSlot(slot); }}
                                                >✕</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Player list */}
                    <div>
                        <h2 className="px-4 py-2 bg-gray-200 text-xs uppercase tracking-wide text-gray-600 font-semibold flex items-center justify-between">
                            <span>Players</span>
                            <span className="font-normal normal-case tracking-normal text-gray-500">
                                {visiblePlayers.length}{filtersActive ? ` of ${players?.length ?? 0}` : ""} available
                            </span>
                        </h2>
                        <div className="px-4 py-2 border-b border-gray-200 flex flex-col gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <input
                                    className="border border-gray-300 rounded-md px-2 py-1 text-sm flex-1 min-w-32"
                                    placeholder="Search players"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                                {POSITION_FILTERS.map((position) => (
                                    <button
                                        key={position}
                                        className={
                                            "text-xs rounded-full px-2 py-1 border " +
                                            (positionFilter === position
                                                ? "bg-gray-800 text-white border-gray-800"
                                                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50")
                                        }
                                        onClick={() => setPositionFilter(positionFilter === position ? null : position)}
                                    >{position}</button>
                                ))}
                            </div>
                            <div className="flex items-center gap-3 flex-wrap text-xs text-gray-600">
                                <label className="flex items-center gap-1">
                                    Max $
                                    <input
                                        type="number"
                                        className="w-16 border border-gray-300 rounded-md px-1 py-1 text-xs"
                                        placeholder="any"
                                        value={maxPrice}
                                        onChange={(event) => setMaxPrice(event.target.value)}
                                        title="Hide players whose price is above this"
                                    />
                                </label>
                                <label className="flex items-center gap-1">
                                    Team
                                    <select
                                        className="border border-gray-300 rounded-md px-1 py-1 text-xs bg-white"
                                        value={teamFilter}
                                        onChange={(event) => setTeamFilter(event.target.value)}
                                    >
                                        <option value="">All</option>
                                        {teamCodes.map((code) => (
                                            <option key={code} value={code}>{code}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="w-3.5 h-3.5 accent-red-500"
                                        checked={favoriteOnly}
                                        onChange={() => setFavoriteOnly((on) => !on)}
                                    />
                                    Favorites only ♥
                                </label>
                                <span className="flex-1" />
                                <button
                                    className="border border-gray-300 rounded-md px-2 py-1 bg-white hover:bg-gray-50 disabled:opacity-40"
                                    disabled={!filtersActive}
                                    onClick={clearFilters}
                                >Clear</button>
                            </div>
                        </div>
                        <div className="max-h-[32rem] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-100 text-gray-500 text-xs uppercase tracking-wide sticky top-0">
                                        <th className="text-left px-4 py-1">Player</th>
                                        <th className="text-left px-2 py-1">Pos</th>
                                        <th className="text-left px-2 py-1">Team</th>
                                        <th className="text-right px-4 py-1">Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiblePlayers.map((player) => (
                                        <tr
                                            key={player.player_id}
                                            className={
                                                "border-b border-gray-100 cursor-pointer " +
                                                (selected?.player_id === player.player_id ? "bg-blue-100" : "hover:bg-gray-50")
                                            }
                                            onClick={() => setSelected(
                                                selected?.player_id === player.player_id ? null : player
                                            )}
                                        >
                                            <td className="px-4 py-1">
                                                {player.name}
                                                {player.favorite === true && <span className="ml-1 text-red-500" title="Favorite">♥</span>}
                                                {player.target_tier > 0 && (
                                                    <span className="ml-1 text-xs text-gray-500" title="Target tier">T{player.target_tier}</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1">
                                                <span
                                                    className="inline-block px-1.5 rounded text-xs font-semibold"
                                                    style={{ background: POSITION_BG_COLORS[player.position], color: POSITION_FG_COLORS[player.position] }}
                                                >{player.position}</span>
                                            </td>
                                            <td className="px-2 py-1 text-gray-500">{player.team || "—"}</td>
                                            <td className="px-4 py-1 text-right">${priceOf(player)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

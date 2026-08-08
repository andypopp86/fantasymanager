import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { draftTargetTiersRetrieve } from "../lib/data";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";
import type { TargetTierOutput, TargetTierPlayer } from "../lib/draft.schemas";

const POSITION_FILTERS = ["QB", "RB", "WR", "TE", "DEF"] as const;

const price = (player: TargetTierPlayer) => parseInt(String(player.projected_price)) || 0;

type TargetTiersProps = {
    draftId: number,
    // player_ids already drafted according to the LOCAL rows (Dexie). The server
    // poll is 15s, which is long enough on a live board for a player you just
    // drafted to linger here; this drops them on the spot.
    hidePlayerIds?: Set<string>,
    // Rendered instead of the columns when nothing is tiered at all.
    emptyState?: React.ReactNode,
    // Opens the budget editor for a player. Omitted where there's no local
    // draft data to edit against (an unhydrated standalone page), in which case
    // the cards stay inert rather than pretending to be clickable.
    onPlayerClick?: (player: TargetTierPlayer) => void,
};

// The tier board itself — one column per Player.target_tier, listing only
// players still undrafted in this draft. Shared by TargetTiersPage (full page)
// and Draft (a collapsible section under the board), so the two can't drift.
//
// Reads the server directly on a poll rather than going through Dexie: tiers are
// reference data this view never writes (same call as SpectatorBoard). React
// Query dedupes the ["target_tiers", draftId] key, so mounting both costs one
// request.
export default function TargetTiers({ draftId, hidePlayerIds, emptyState, onPlayerClick }: TargetTiersProps) {
    const [positions, setPositions] = useState<string[]>([]);

    const { data: tiers, isLoading, dataUpdatedAt, refetch } = useQuery({
        queryKey: ["target_tiers", draftId],
        queryFn: () => draftTargetTiersRetrieve(draftId),
        select: (response) => response.data as TargetTierOutput[],
        refetchInterval: 15000,
        staleTime: 0,
    });

    const togglePosition = (position: string) => {
        setPositions((prev) =>
            prev.includes(position) ? prev.filter((p) => p !== position) : [...prev, position]
        );
    };

    // Filtering keeps every tier column mounted (an emptied tier still shows its
    // header) so the columns don't reflow as filters change.
    const columns = useMemo(() => {
        if (!tiers) return [];
        return tiers.map((tier) => ({
            tier: tier.tier,
            players: tier.players.filter((player) => {
                if (hidePlayerIds?.has(String(player.player_id))) return false;
                return positions.length === 0 || positions.includes(player.position);
            }),
        }));
    }, [tiers, positions, hidePlayerIds]);

    const totalShown = columns.reduce((acc, column) => acc + column.players.length, 0);

    return (
        <>
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-2 flex-wrap">
                <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Position</span>
                {POSITION_FILTERS.map((position) => (
                    <button
                        key={position}
                        className={
                            "text-xs font-semibold rounded-full px-2.5 py-1 border " +
                            (positions.includes(position)
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100")
                        }
                        onClick={() => togglePosition(position)}
                    >
                        {position}
                    </button>
                ))}
                {positions.length > 0 && (
                    <button className="text-xs text-gray-500 underline" onClick={() => setPositions([])}>
                        clear
                    </button>
                )}
                <span className="flex-1" />
                <span className="text-xs text-gray-500">
                    {totalShown} available target{totalShown === 1 ? "" : "s"}
                    {dataUpdatedAt ? ` · updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}
                </span>
                <button
                    className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white hover:bg-gray-100"
                    onClick={() => refetch()}
                    title="Refresh now (auto-refreshes every 15s)"
                >
                    ⟳
                </button>
            </div>

            {isLoading && <p className="px-4 py-6 text-center text-gray-500">Loading tiers…</p>}

            {!isLoading && columns.length === 0 && (emptyState ?? (
                <p className="px-4 py-8 text-center text-gray-500">
                    No tiered players yet — set <span className="font-mono">target_tier</span> on players in
                    the admin (Draft → Players); tier 1 is the top tier, 0 means untiered.
                </p>
            ))}

            {/* Horizontal scroll only — the strip has NO height cap, and neither
                do the columns. items-start keeps every column at its natural
                height, so the ragged bottoms read as tier sizes; any vertical
                cap here (per column or per strip) flattens that away. The
                enclosing page/board column does the vertical scrolling. */}
            {columns.length > 0 && (
                <div className="flex gap-3 overflow-x-auto p-3 items-start">
                    {columns.map(({ tier, players }) => (
                        <div key={tier} className="flex-none w-56 bg-gray-50 border border-gray-200 rounded-lg">
                            {/* Sticky so the tier label and count stay visible
                                while the strip scrolls past them. */}
                            <div className="sticky top-0 z-10 px-3 py-2 border-b border-gray-200 bg-gray-200 rounded-t-lg flex items-center justify-between">
                                <h2 className="font-bold text-gray-800">Tier {tier}</h2>
                                <span className="bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-full px-2 py-0.5">
                                    {players.length}
                                </span>
                            </div>
                            <ul className="p-2 space-y-1">
                                {players.map((player) => (
                                    <li
                                        key={player.player_id}
                                        className={
                                            "bg-white border border-gray-200 rounded-md px-2 py-1.5 text-sm" +
                                            (onPlayerClick ? " cursor-pointer hover:border-blue-400 hover:bg-blue-50" : "")
                                        }
                                        title={
                                            onPlayerClick
                                                ? [player.notes, `Budget ${player.name}`].filter(Boolean).join(" — ")
                                                : player.notes || undefined
                                        }
                                        onClick={onPlayerClick ? () => onPlayerClick(player) : undefined}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold leading-none"
                                                style={{
                                                    background: POSITION_BG_COLORS[player.position],
                                                    color: POSITION_FG_COLORS[player.position],
                                                }}
                                            >
                                                {player.position}
                                            </span>
                                            <span className="font-semibold text-gray-800 truncate">{player.name}</span>
                                            {player.favorite === true && <span title="Favorite">❤️</span>}
                                            {player.favorite === false && <span title="Avoid">💔</span>}
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                                            <span>{player.team || "—"}</span>
                                            <span>${price(player)}</span>
                                        </div>
                                    </li>
                                ))}
                                {players.length === 0 && (
                                    <li className="text-xs text-gray-400 text-center py-2">none available</li>
                                )}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftRetrieve, draftSummaryRetrieve } from "../lib/data";
import InstantTooltip from "./InstantTooltip";
import type { DraftSummaryOutput, SummaryManager } from "../lib/draft.schemas";

// /draft/:draftId/summary — the post-draft dashboard. Read-only and server-fed
// (React Query straight to `/summary/`, NOT Dexie): nothing here writes, and it
// is a look-back rather than draft-day flow, same reasoning as Target Tiers and
// the mock page.
//
// Every number on the page comes from DraftReadService.get_draft_summary, so the
// widgets can't disagree with each other about what a manager spent.

// Categorical hues for the five player positions, in fixed order — assigned per
// POSITION, never per rank, so a manager with no TE doesn't shift everyone else's
// colours. Okabe-Ito steps: they clear the adjacent-pair CVD check where the
// board's raw "blue/green/orange/brown" CSS names do not. Two of them sit under
// 3:1 against white, which is why every segment is also directly labelled and the
// same numbers appear in a table below.
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "DEF"];
const POSITION_COLORS: Record<string, string> = {
    QB: "#D55E00",
    RB: "#0072B2",
    WR: "#009E73",
    TE: "#E69F00",
    DEF: "#CC79A7",
};
const UNKNOWN_POSITION_COLOR = "#6b7280";
const positionColor = (position: string) => POSITION_COLORS[position] || UNKNOWN_POSITION_COLOR;

// Over/under pay is POLARITY, so it gets a diverging pair with a neutral middle:
// paid more than projected is red, got a bargain is green, and dead-on is grey.
const OVER_COLOR = "#b91c1c";
const UNDER_COLOR = "#15803d";
const NEUTRAL_COLOR = "#9ca3af";
const diffColor = (diff: number) => (diff > 0 ? OVER_COLOR : diff < 0 ? UNDER_COLOR : NEUTRAL_COLOR);
const diffText = (diff: number) =>
    diff > 0 ? "text-red-700" : diff < 0 ? "text-green-700" : "text-gray-500";
const money = (value: number) => `$${Math.round(value)}`;
// Signed, because the whole page is about the direction of the gap.
const signedMoney = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}$${Math.abs(Math.round(value))}`;

const CARD = "bg-white rounded-lg shadow-sm border border-gray-200";
const CARD_TITLE = "text-sm font-bold text-gray-800 uppercase tracking-wide";

function PositionBadge({ position }: { position: string }) {
    return (
        <span
            className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white leading-none align-middle"
            style={{ backgroundColor: positionColor(position) }}
        >
            {position || "?"}
        </span>
    );
}

function StatTile({ label, value, hint, color }: { label: string, value: string, hint?: string, color?: string }) {
    return (
        <div className={`${CARD} px-4 py-3 flex-1 min-w-40`}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold" style={color ? { color } : undefined}>{value}</div>
            {hint && <div className="text-xs text-gray-500">{hint}</div>}
        </div>
    );
}

// Widget 1 — over/under pay, one diverging bar per manager off a shared zero
// line. Sorted by the number it draws, so the biggest overpay is the top row.
function OverUnderWidget({ managers }: { managers: SummaryManager[] }) {
    const rows = useMemo(
        () => [...managers].sort((a, b) => b.total_diff - a.total_diff),
        [managers],
    );
    const extent = Math.max(1, ...rows.map((m) => Math.abs(m.total_diff)));

    return (
        <div className={`${CARD} p-4`}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
                <h2 className={CARD_TITLE}>Aggregate over / under pay</h2>
                <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: UNDER_COLOR }} />
                        Under projection
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: OVER_COLOR }} />
                        Over projection
                    </span>
                </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">Actual price minus projected price, summed over the roster.</p>

            <div className="space-y-1">
                {rows.map((manager) => {
                    const pct = (Math.abs(manager.total_diff) / extent) * 50;
                    const over = manager.total_diff > 0;
                    return (
                        <div key={manager.manager_id} className="flex items-center gap-2">
                            <div className="w-28 shrink-0 truncate text-xs font-semibold text-gray-700 text-right">
                                {manager.manager_name}
                                {manager.is_drafter && <span className="text-yellow-600" title="You"> ★</span>}
                            </div>
                            <div className="relative flex-1 h-6 bg-gray-50 rounded">
                                <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
                                <div
                                    className="absolute inset-y-1 rounded"
                                    style={{
                                        backgroundColor: diffColor(manager.total_diff),
                                        width: `${Math.max(pct, manager.total_diff === 0 ? 0 : 0.6)}%`,
                                        left: over ? "50%" : `${50 - pct}%`,
                                    }}
                                />
                                <span
                                    className={`absolute top-1/2 -translate-y-1/2 text-[11px] font-bold ${diffText(manager.total_diff)}`}
                                    style={over
                                        ? { left: `calc(50% + ${pct}% + 4px)` }
                                        : { right: `calc(50% + ${pct}% + 4px)` }}
                                >
                                    {signedMoney(manager.total_diff)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Widget 2 — where the money went, by the PLAYER's position (roster slot is
// deliberately ignored: a WR in FLEX2 is WR spend). Toggles between raw dollars
// and share of the manager's own spend, since the two answer different questions
// ("who spent most on RBs" vs "who is an RB-heavy team").
function PositionAllocationWidget({ managers, positions }: { managers: SummaryManager[], positions: string[] }) {
    const [asShare, setAsShare] = useState(false);
    const ordered = useMemo(() => {
        const known = POSITION_ORDER.filter((p) => positions.includes(p));
        return [...known, ...positions.filter((p) => !POSITION_ORDER.includes(p))];
    }, [positions]);
    const maxSpend = Math.max(1, ...managers.map((m) => m.total_price));

    return (
        <div className={`${CARD} p-4`}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
                <h2 className={CARD_TITLE}>Spend by position</h2>
                <div className="flex items-center gap-2">
                    <button
                        className={`text-xs px-2 py-1 rounded border ${asShare ? "bg-white border-gray-300 text-gray-600" : "bg-gray-800 border-gray-800 text-white"}`}
                        onClick={() => setAsShare(false)}
                    >
                        Dollars
                    </button>
                    <button
                        className={`text-xs px-2 py-1 rounded border ${asShare ? "bg-gray-800 border-gray-800 text-white" : "bg-white border-gray-300 text-gray-600"}`}
                        onClick={() => setAsShare(true)}
                    >
                        Share
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 mb-3">
                {ordered.map((position) => (
                    <span key={position} className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: positionColor(position) }} />
                        {position}
                    </span>
                ))}
            </div>

            <div className="space-y-1">
                {managers.map((manager) => {
                    const total = manager.total_price || 0;
                    // In dollars every bar shares one scale (so bar length is
                    // comparable across managers); in share mode each fills its row.
                    const rowScale = asShare ? 100 : (total / maxSpend) * 100;
                    return (
                        <div key={manager.manager_id} className="flex items-center gap-2">
                            <div className="w-28 shrink-0 truncate text-xs font-semibold text-gray-700 text-right">
                                {manager.manager_name}
                            </div>
                            <div className="flex-1 h-6 flex items-center">
                                <div className="flex h-5 rounded overflow-hidden gap-[2px]" style={{ width: `${rowScale}%` }}>
                                    {ordered.map((position) => {
                                        const bucket = manager.position_allocation[position];
                                        if (!bucket || !bucket.spend) return null;
                                        const share = total ? (bucket.spend / total) * 100 : 0;
                                        return (
                                            <InstantTooltip
                                                key={position}
                                                label={`${position}: ${money(bucket.spend)} · ${bucket.count} player${bucket.count === 1 ? "" : "s"} · ${share.toFixed(0)}%`}
                                                className="h-full"
                                            >
                                                <span
                                                    className="h-full flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
                                                    style={{ backgroundColor: positionColor(position), width: `${share}%`, minWidth: 2 }}
                                                >
                                                    {share >= 12 && (asShare ? `${position} ${share.toFixed(0)}%` : `${position} ${money(bucket.spend)}`)}
                                                </span>
                                            </InstantTooltip>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="w-14 shrink-0 text-xs text-gray-500 tabular-nums">{money(total)}</div>
                        </div>
                    );
                })}
            </div>

            {/* The table view the low-contrast segments oblige, and the exact
                numbers the bars only approximate. */}
            <div className="overflow-x-auto mt-4">
                <table className="text-xs w-full border-collapse">
                    <thead>
                        <tr className="bg-gray-100 text-gray-700">
                            <th className="text-left px-2 py-1 font-semibold">Manager</th>
                            {ordered.map((position) => (
                                <th key={position} className="text-right px-2 py-1 font-semibold whitespace-nowrap">
                                    <PositionBadge position={position} />
                                </th>
                            ))}
                            <th className="text-right px-2 py-1 font-semibold">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {managers.map((manager) => (
                            <tr key={manager.manager_id} className="border-t border-gray-200">
                                <td className="px-2 py-1 font-semibold text-gray-700 whitespace-nowrap">{manager.manager_name}</td>
                                {ordered.map((position) => {
                                    const bucket = manager.position_allocation[position];
                                    return (
                                        <td key={position} className="px-2 py-1 text-right tabular-nums text-gray-700">
                                            {bucket ? `${money(bucket.spend)} (${bucket.count})` : "—"}
                                        </td>
                                    );
                                })}
                                <td className="px-2 py-1 text-right tabular-nums font-semibold">{money(manager.total_price)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Widget 3 — roster size and average price, sorted by count descending (the
// requested ordering). Count gets the bar; average rides alongside as a number,
// because two measures on one axis is exactly the dual-axis mistake.
function RosterShapeWidget({ managers }: { managers: SummaryManager[] }) {
    const rows = useMemo(
        () => [...managers].sort((a, b) => b.pick_count - a.pick_count || b.average_price - a.average_price),
        [managers],
    );
    const maxCount = Math.max(1, ...rows.map((m) => m.pick_count));
    const maxAvg = Math.max(1, ...rows.map((m) => m.average_price));

    return (
        <div className={`${CARD} p-4`}>
            <h2 className={CARD_TITLE}>Roster size & average price</h2>
            <p className="text-xs text-gray-500 mb-3">Most players first. A long roster with a low average is the $1-bench strategy.</p>
            <table className="text-xs w-full border-collapse">
                <thead>
                    <tr className="text-gray-500">
                        <th className="text-left px-2 py-1 font-semibold">Manager</th>
                        <th className="text-left px-2 py-1 font-semibold w-1/2">Players</th>
                        <th className="text-right px-2 py-1 font-semibold whitespace-nowrap">Avg $</th>
                        <th className="text-right px-2 py-1 font-semibold whitespace-nowrap">Spent</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((manager) => (
                        <tr key={manager.manager_id} className="border-t border-gray-200">
                            <td className="px-2 py-1 font-semibold text-gray-700 whitespace-nowrap">{manager.manager_name}</td>
                            <td className="px-2 py-1">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="h-3 rounded bg-gray-700"
                                        style={{ width: `${(manager.pick_count / maxCount) * 100}%`, minWidth: 2 }}
                                    />
                                    <span className="tabular-nums text-gray-700 font-semibold">{manager.pick_count}</span>
                                </div>
                            </td>
                            <td className="px-2 py-1">
                                <div className="flex items-center gap-2 justify-end">
                                    <div
                                        className="h-3 rounded bg-gray-400"
                                        style={{ width: `${(manager.average_price / maxAvg) * 60}px`, minWidth: 2 }}
                                    />
                                    <span className="tabular-nums text-gray-700 font-semibold w-10 text-right">
                                        ${manager.average_price.toFixed(1)}
                                    </span>
                                </div>
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums text-gray-600">{money(manager.total_price)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Widget 4 — the roster itself: every player a manager bought, actual vs
// projected, with the per-player gap and the sum that the first widget charts.
function ManagerRosterCard({ manager }: { manager: SummaryManager }) {
    const [sortByDiff, setSortByDiff] = useState(false);
    const picks = useMemo(
        () => (sortByDiff ? [...manager.picks].sort((a, b) => b.diff - a.diff) : manager.picks),
        [manager.picks, sortByDiff],
    );

    return (
        <div className={`${CARD} p-3`}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold text-gray-800 truncate">
                    {manager.manager_name}
                    {manager.is_drafter && <span className="text-yellow-600" title="You"> ★</span>}
                </h3>
                <button
                    className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    onClick={() => setSortByDiff((prev) => !prev)}
                    title="Toggle between price order and over/under order"
                >
                    {sortByDiff ? "By price" : "By diff"}
                </button>
            </div>
            <table className="text-xs w-full border-collapse">
                <thead>
                    <tr className="text-gray-500">
                        <th className="text-left px-1 py-0.5 font-semibold">Player</th>
                        <th className="text-right px-1 py-0.5 font-semibold">Paid</th>
                        <th className="text-right px-1 py-0.5 font-semibold">Proj</th>
                        <th className="text-right px-1 py-0.5 font-semibold">+/−</th>
                    </tr>
                </thead>
                <tbody>
                    {picks.map((pick) => (
                        <tr key={`${pick.player_id}-${pick.position_slot}`} className="border-t border-gray-100">
                            <td className="px-1 py-0.5 text-gray-800">
                                <PositionBadge position={pick.position} />
                                <span className="ml-1 align-middle">{pick.name}</span>
                            </td>
                            <td className="px-1 py-0.5 text-right tabular-nums">{money(pick.price)}</td>
                            <td className="px-1 py-0.5 text-right tabular-nums text-gray-500">{money(pick.projected_price)}</td>
                            <td className={`px-1 py-0.5 text-right tabular-nums font-semibold ${diffText(pick.diff)}`}>
                                {signedMoney(pick.diff)}
                            </td>
                        </tr>
                    ))}
                    {picks.length === 0 && (
                        <tr><td colSpan={4} className="px-1 py-2 text-center text-gray-400">No players drafted</td></tr>
                    )}
                </tbody>
                <tfoot>
                    <tr className="border-t-2 border-gray-300 font-bold">
                        <td className="px-1 py-1 text-gray-700">{manager.pick_count} players</td>
                        <td className="px-1 py-1 text-right tabular-nums">{money(manager.total_price)}</td>
                        <td className="px-1 py-1 text-right tabular-nums text-gray-500">{money(manager.total_projected)}</td>
                        <td className={`px-1 py-1 text-right tabular-nums ${diffText(manager.total_diff)}`}>
                            {signedMoney(manager.total_diff)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

export default function DraftSummaryPage() {
    const { draftId: draftIdParam } = useParams();
    const navigate = useNavigate();

    const { data: draftDetails } = useQuery({
        queryKey: ["draft_detail", draftIdParam],
        queryFn: () => draftRetrieve(draftIdParam),
        select: (response) => response.data,
    });

    const { data: summary, isLoading, isError } = useQuery({
        queryKey: ["draft_summary", draftIdParam],
        queryFn: () => draftSummaryRetrieve(draftIdParam as string),
        select: (response: any) => response.data as DraftSummaryOutput,
    });

    const managers = summary?.managers || [];
    const totals = useMemo(() => {
        const spent = managers.reduce((sum, m) => sum + m.total_price, 0);
        const projected = managers.reduce((sum, m) => sum + m.total_projected, 0);
        const players = managers.reduce((sum, m) => sum + m.pick_count, 0);
        return { spent, projected, players, diff: spent - projected };
    }, [managers]);

    return (
        <div className="min-h-screen bg-gray-100 py-4 px-2 sm:px-4">
            <div className="max-w-full mx-auto">
                <div className="bg-green-200 px-4 py-3 flex items-center gap-3 flex-wrap rounded-t-lg">
                    <button
                        className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50 active:bg-gray-100 shadow-sm"
                        onClick={() => navigate(`/draft/${draftIdParam}`)}
                    >
                        ← Back to board
                    </button>
                    <div className="flex-1 text-center min-w-40">
                        <h1 className="text-xl font-bold text-gray-800">Draft Summary</h1>
                        <p className="text-sm text-gray-600">{draftDetails?.draft_name || `Draft ${draftIdParam}`}</p>
                    </div>
                    <span className="w-28" />
                </div>

                {isLoading && <p className="p-4 text-sm text-gray-600">Loading summary…</p>}
                {isError && <p className="p-4 text-sm text-red-700">Could not load this draft's summary.</p>}

                {summary && (
                    <div className="space-y-4 mt-4">
                        <div className="flex flex-wrap gap-3">
                            <StatTile label="Players drafted" value={String(totals.players)} />
                            <StatTile label="Total spent" value={money(totals.spent)} />
                            <StatTile label="Total projected" value={money(totals.projected)} />
                            <StatTile
                                label="League over / under"
                                value={signedMoney(totals.diff)}
                                hint={totals.diff > 0 ? "paid above projection" : "paid below projection"}
                                color={diffColor(totals.diff)}
                            />
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <OverUnderWidget managers={managers} />
                            <RosterShapeWidget managers={managers} />
                        </div>

                        <PositionAllocationWidget managers={managers} positions={summary.positions} />

                        <div>
                            <h2 className={`${CARD_TITLE} mb-2`}>Rosters</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                                {managers.map((manager) => (
                                    <ManagerRosterCard key={manager.manager_id} manager={manager} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

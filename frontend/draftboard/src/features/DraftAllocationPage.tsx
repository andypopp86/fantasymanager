import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftAllocationRetrieve } from "../lib/data";
import type { AllocationPlayer, AllocationRow, DraftAllocationOutput } from "../lib/draft.schemas";

// /draft/:draftId/allocation — "am I drifting off my own plan, and where".
//
// The plan is the per-position dollar targets fixed when the draft was created
// (Draft.target_*); this page draws the drafter's ACTUAL spend and their BUDGET
// PLAN against it, position by position. Opened in its own browser tab from the
// board (the board has no room for it, and on draft day this belongs on the
// second screen), so nothing here is shared with the board's state.
//
// Read-only and server-fed through React Query — NOT Dexie, not the write queue
// — like Summary, Playback and Target Tiers. Every number comes from
// DraftReadService.get_position_allocation so this page and the board's budget
// panel can't disagree about what the plan costs.

// Live enough for draft day without hammering the API — same cadence as the
// target-tiers strip.
const POLL_MS = 15000;

// Same Okabe-Ito steps as the summary and playback pages: those pages sit one
// click away and must not disagree about what a WR looks like. NOT the board's
// POSITION_BG_COLORS, which fail the adjacent-pair colour-blindness check.
const POSITION_COLORS: Record<string, string> = {
    QB: "#D55E00",
    RB: "#0072B2",
    WR: "#009E73",
    TE: "#E69F00",
    DEF: "#CC79A7",
};
const UNKNOWN_POSITION_COLOR = "#6b7280";
const positionColor = (position: string) => POSITION_COLORS[position] || UNKNOWN_POSITION_COLOR;

// The verdict colours. Polarity here is NOT the summary page's over/under PAY —
// this is deviation from plan, and the direction that stung last draft is the
// SHORTAGE, so short is the red one. Over-allocation is amber (a choice, but a
// deliberate one), dead-on is grey.
const SHORT_COLOR = "#b91c1c";
const OVER_COLOR = "#b45309";
const ON_PLAN_COLOR = "#6b7280";
const diffColor = (diff: number) => (diff < 0 ? SHORT_COLOR : diff > 0 ? OVER_COLOR : ON_PLAN_COLOR);
const diffText = (diff: number) =>
    diff < 0 ? "text-red-700" : diff > 0 ? "text-amber-700" : "text-gray-500";
// Spend − target, so the label says which way the gap runs rather than making
// the reader remember the sign convention.
const diffLabel = (diff: number) =>
    diff === 0 ? "on plan" : diff < 0 ? `$${Math.abs(diff)} short` : `$${diff} over`;
const money = (value: number) => `$${Math.round(value)}`;

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

// One measured bar against the shared dollar scale, with the target drawn as a
// tick ON the track — the gap between bar end and tick IS the shortage, which is
// the whole point of the page.
function MeasuredBar({
    label, value, target, diff, scale, color, showTarget,
}: {
    label: string, value: number, target: number, diff: number,
    scale: number, color: string, showTarget: boolean,
}) {
    const width = `${Math.min(100, (value / scale) * 100)}%`;
    const targetLeft = `${Math.min(100, (target / scale) * 100)}%`;
    return (
        <div className="flex items-center gap-2">
            <div className="w-14 shrink-0 text-[11px] font-semibold text-gray-500 uppercase text-right">{label}</div>
            <div className="relative flex-1 h-5 bg-gray-50 rounded">
                <div className="absolute inset-y-0.5 left-0 rounded" style={{ width, backgroundColor: color }} />
                {showTarget && (
                    <div
                        className="absolute -inset-y-0.5 w-0.5 bg-gray-800"
                        style={{ left: targetLeft }}
                        title={`Target ${money(target)}`}
                    />
                )}
            </div>
            <div className="w-16 shrink-0 text-right text-xs font-bold text-gray-800">{money(value)}</div>
            <div className={`w-24 shrink-0 text-right text-xs font-semibold ${showTarget ? diffText(diff) : "text-gray-400"}`}>
                {showTarget ? diffLabel(diff) : "—"}
            </div>
        </div>
    );
}

function PlayerList({ title, players, empty }: { title: string, players: AllocationPlayer[], empty: string }) {
    return (
        <div className="flex-1 min-w-52">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">{title}</div>
            {players.length === 0 && <p className="text-xs text-gray-400">{empty}</p>}
            {players.map((player) => (
                <div key={`${player.player_id}-${player.position_slot}`} className="flex items-baseline gap-2 text-xs py-0.5 border-b border-gray-100 last:border-0">
                    <span className="w-14 shrink-0 text-gray-500">{player.position_slot}</span>
                    <span className="flex-1 truncate text-gray-800">{player.name}</span>
                    {/* A budgeted player an OPPONENT took is still priced at what
                        he actually went for (that is the budget panel's rule), so
                        say who has him rather than letting the dollars lie. */}
                    {player.is_drafted && player.drafted_by && (
                        <span className="text-[10px] text-gray-400 truncate">→ {player.drafted_by}</span>
                    )}
                    <span className="font-bold text-gray-800">{money(player.price)}</span>
                </div>
            ))}
        </div>
    );
}

// One position: the target, the two bars measured against it, and the players
// behind each number on demand.
function PositionCard({ row, scale, hasTargets }: { row: AllocationRow, scale: number, hasTargets: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const worst = Math.min(row.actual_diff, row.planned_diff);
    return (
        <div className={`${CARD} p-3`}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
                <div className="flex items-baseline gap-2">
                    <PositionBadge position={row.position} />
                    <span className="text-sm font-bold text-gray-800">{row.position}</span>
                    <span className="text-xs text-gray-500">
                        target {hasTargets ? money(row.target) : "—"}
                    </span>
                </div>
                <button
                    className="text-xs text-blue-700 hover:underline"
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? "Hide players" : `${row.actual_count} drafted · ${row.planned_count} planned`}
                </button>
            </div>

            <div className="space-y-1">
                <MeasuredBar
                    label="Actual" value={row.actual} target={row.target} diff={row.actual_diff}
                    scale={scale} color={positionColor(row.position)} showTarget={hasTargets}
                />
                <MeasuredBar
                    label="Plan" value={row.planned} target={row.target} diff={row.planned_diff}
                    scale={scale} color={`${positionColor(row.position)}66`} showTarget={hasTargets}
                />
            </div>

            {hasTargets && worst < 0 && (
                <p className={`mt-1 text-xs font-semibold ${diffText(worst)}`}>
                    {row.actual_diff < 0 && `Drafted ${money(Math.abs(row.actual_diff))} under plan.`}
                    {row.actual_diff < 0 && row.planned_diff < 0 && " "}
                    {row.planned_diff < 0 && `Even the plan is ${money(Math.abs(row.planned_diff))} light.`}
                </p>
            )}

            {expanded && (
                <div className="flex flex-wrap gap-4 mt-2 pt-2 border-t border-gray-100">
                    <PlayerList title="Drafted" players={row.actual_players} empty="Nobody drafted here yet." />
                    <PlayerList title="Budget plan" players={row.planned_players} empty="Nothing budgeted here." />
                </div>
            )}
        </div>
    );
}

export default function DraftAllocationPage() {
    const { draftId: draftIdParam } = useParams();
    const navigate = useNavigate();

    const { data: allocation, isLoading, isError } = useQuery({
        queryKey: ["draft_allocation", draftIdParam],
        queryFn: () => draftAllocationRetrieve(draftIdParam as string),
        select: (response: any) => response.data as DraftAllocationOutput,
        refetchInterval: POLL_MS,
    });

    const rows = allocation?.rows || [];
    // One shared dollar scale across every position, so the bars are comparable
    // between cards — a per-card scale would make a $4 DEF look like a $80 RB.
    const scale = useMemo(
        () => Math.max(1, ...rows.map((row) => Math.max(row.target, row.actual, row.planned))),
        [rows],
    );
    const shortages = useMemo(
        () => rows.filter((row) => row.actual_diff < 0).sort((a, b) => a.actual_diff - b.actual_diff),
        [rows],
    );

    return (
        <div className="min-h-screen bg-gray-100 py-4 px-2 sm:px-4">
            <div className="max-w-6xl mx-auto">
                <div className="bg-green-200 px-4 py-3 flex items-center gap-3 flex-wrap rounded-t-lg">
                    <button
                        className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50 active:bg-gray-100 shadow-sm"
                        onClick={() => navigate(`/draft/${draftIdParam}`)}
                    >
                        ← Back to board
                    </button>
                    <div className="flex-1 text-center min-w-40">
                        <h1 className="text-xl font-bold text-gray-800">Positional Allocation</h1>
                        <p className="text-sm text-gray-600">{allocation?.draft_name || `Draft ${draftIdParam}`}</p>
                    </div>
                    <span className="text-xs text-gray-600">updates every 15s</span>
                </div>

                {isLoading && <p className="p-4 text-sm text-gray-600">Loading allocation…</p>}
                {isError && <p className="p-4 text-sm text-red-700">Could not load this draft's allocation.</p>}

                {allocation && (
                    <div className="space-y-4 mt-4">
                        {!allocation.has_drafter && (
                            <p className={`${CARD} p-4 text-sm text-red-700`}>
                                No manager in this draft is flagged as the drafter, so there is no
                                roster to measure. Mark one with a <code>*</code> when creating a draft.
                            </p>
                        )}
                        {!allocation.has_targets && (
                            <p className={`${CARD} p-4 text-sm text-gray-700`}>
                                This draft was created without per-position targets, so there is nothing
                                to measure against — the bars below are spend only. Targets are set on
                                the create-draft form.
                            </p>
                        )}

                        <div className="flex flex-wrap gap-3">
                            <StatTile
                                label="Drafted"
                                value={money(allocation.actual_total)}
                                hint={`of ${money(allocation.starting_budget)} starting budget`}
                            />
                            <StatTile
                                label="Budget left"
                                value={money(allocation.budget_remaining)}
                                hint="starting budget minus actual spend"
                            />
                            <StatTile
                                label="Plan total"
                                value={money(allocation.planned_total)}
                                hint="budget panel, actual price where drafted"
                            />
                            <StatTile
                                label="Target total"
                                value={allocation.has_targets ? money(allocation.target_total) : "—"}
                                hint={allocation.has_targets ? "set at draft creation" : "no plan entered"}
                            />
                        </div>

                        {allocation.has_targets && allocation.has_drafter && (
                            <div className={`${CARD} p-4`}>
                                <h2 className={CARD_TITLE}>Where you are short</h2>
                                <p className="text-xs text-gray-500 mb-2">
                                    Positions whose drafted spend sits under target, deepest shortage first.
                                </p>
                                {shortages.length === 0 && (
                                    <p className="text-sm text-gray-600">Nothing is under target right now.</p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {shortages.map((row) => (
                                        <span
                                            key={row.position}
                                            className="inline-flex items-center gap-2 rounded px-2 py-1 text-sm font-bold text-white"
                                            style={{ backgroundColor: diffColor(row.actual_diff) }}
                                        >
                                            <PositionBadge position={row.position} />
                                            {money(Math.abs(row.actual_diff))} short
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                            {rows.map((row) => (
                                <PositionCard
                                    key={row.position}
                                    row={row}
                                    scale={scale}
                                    hasTargets={allocation.has_targets}
                                />
                            ))}
                        </div>

                        <div className={`${CARD} p-4`}>
                            <h2 className={`${CARD_TITLE} mb-2`}>The numbers</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                                            <th className="text-left py-1 pr-2">Pos</th>
                                            <th className="text-right py-1 px-2">Target</th>
                                            <th className="text-right py-1 px-2">Drafted</th>
                                            <th className="text-right py-1 px-2">vs target</th>
                                            <th className="text-right py-1 px-2">Plan</th>
                                            <th className="text-right py-1 px-2">vs target</th>
                                            <th className="text-right py-1 pl-2">Players</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => (
                                            <tr key={row.position} className="border-b border-gray-100 last:border-0">
                                                <td className="py-1 pr-2"><PositionBadge position={row.position} /> {row.position}</td>
                                                <td className="text-right py-1 px-2">{allocation.has_targets ? money(row.target) : "—"}</td>
                                                <td className="text-right py-1 px-2 font-semibold">{money(row.actual)}</td>
                                                <td className={`text-right py-1 px-2 font-semibold ${allocation.has_targets ? diffText(row.actual_diff) : "text-gray-400"}`}>
                                                    {allocation.has_targets ? diffLabel(row.actual_diff) : "—"}
                                                </td>
                                                <td className="text-right py-1 px-2">{money(row.planned)}</td>
                                                <td className={`text-right py-1 px-2 ${allocation.has_targets ? diffText(row.planned_diff) : "text-gray-400"}`}>
                                                    {allocation.has_targets ? diffLabel(row.planned_diff) : "—"}
                                                </td>
                                                <td className="text-right py-1 pl-2 text-gray-600">
                                                    {row.actual_count} / {row.planned_count}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="font-bold">
                                            <td className="py-1 pr-2">Total</td>
                                            <td className="text-right py-1 px-2">{allocation.has_targets ? money(allocation.target_total) : "—"}</td>
                                            <td className="text-right py-1 px-2">{money(allocation.actual_total)}</td>
                                            <td className="text-right py-1 px-2" />
                                            <td className="text-right py-1 px-2">{money(allocation.planned_total)}</td>
                                            <td className="text-right py-1 px-2" />
                                            <td className="text-right py-1 pl-2" />
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                Spend is grouped by the PLAYER's position, never the roster slot — a WR
                                in FLEX2 is WR spend. "Plan" is the budget panel's own arithmetic: the
                                actual price where a budgeted player is already off the board, the
                                projected price otherwise.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

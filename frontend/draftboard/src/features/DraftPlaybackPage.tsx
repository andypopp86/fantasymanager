import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftPlaybackRetrieve } from "../lib/data";
import { getRiskColors } from "../utils/colors";
import InstantTooltip from "./InstantTooltip";
import type {
    DraftPlaybackOutput,
    PlaybackPick,
    PlaybackPoolPlayer,
} from "../lib/draft.schemas";

// /draft/:draftId/playback — replay a finished draft one pick at a time.
//
// The question it answers is "who was still on the board when I made that pick,
// and what did everyone have left to spend" — so the page is a FUNCTION OF ONE
// NUMBER, `step`: the count of picks that have happened. step 0 is the moment
// before the draft started; step N is just after pick N.
//
// Every frame is derived on the client from a single payload
// (`/playback/` → picks + the whole pool, each pool row carrying the pick index
// it came off the board at). That is the point of the endpoint's shape: scrubbing
// must not cost a request per frame. Nothing here writes, so it goes straight to
// the server through React Query, not Dexie — same as Summary and Target Tiers.

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "DEF"];
// Same Okabe-Ito steps as the summary dashboard (`POSITION_COLORS` there), for
// the same reason: the board's raw CSS colour names fail the adjacent-pair
// colour-blindness check, and these two pages sit one click apart.
const POSITION_COLORS: Record<string, string> = {
    QB: "#D55E00",
    RB: "#0072B2",
    WR: "#009E73",
    TE: "#E69F00",
    DEF: "#CC79A7",
};
const positionColor = (position: string) => POSITION_COLORS[position] || "#6b7280";

// Polarity, matching the summary page: paid over projection is red, a bargain
// is green, dead-on is grey.
const diffText = (diff: number) =>
    diff > 0 ? "text-red-700" : diff < 0 ? "text-green-700" : "text-gray-500";
const money = (value: number) => `$${Math.round(value)}`;
const signedMoney = (value: number) =>
    `${value > 0 ? "+" : value < 0 ? "−" : ""}$${Math.abs(Math.round(value))}`;
const pickClock = (isoTime: string | null) =>
    isoTime ? new Date(isoTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

const CARD = "bg-white rounded-lg shadow-sm border border-gray-200";
const CARD_TITLE = "text-sm font-bold text-gray-800 uppercase tracking-wide";
const BTN = "bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50 active:bg-gray-100 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed";

// Seconds per pick for auto-play. Real drafts run minutes per pick, so the
// useful range is "fast enough to watch a run develop".
const SPEEDS = [
    { label: "0.5s", ms: 500 },
    { label: "1s", ms: 1000 },
    { label: "2s", ms: 2000 },
    { label: "4s", ms: 4000 },
];

// The board's available-players ordering (price desc → favorite → adp), on the
// FLAT pool row this endpoint sends. It is not `byFavoriteThenAdp` from
// utils/draftHelpers because that reads `row.player.favorite` off a Dexie row;
// the ordering it encodes is the same one, and the tiebreaks matter for the same
// reason — dozens of players share a $1 projection.
const favoriteRank = (player: PlaybackPoolPlayer) =>
    player.favorite === true ? 2 : player.favorite === false ? 0 : 1;
const byPriceThenFavoriteThenAdp = (a: PlaybackPoolPlayer, b: PlaybackPoolPlayer) =>
    (b.projected_price - a.projected_price)
    || (favoriteRank(b) - favoriteRank(a))
    || ((a.adp_formatted || 9999) - (b.adp_formatted || 9999));

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

// ---- Transport ------------------------------------------------------------
// Step / scrub / auto-play. The slider is the fast-forward: 0 is pre-draft and
// the max is the final pick, so dragging it IS jumping to a point in the draft.
function TransportBar({
    step, total, setStep, playing, setPlaying, speedMs, setSpeedMs,
}: {
    step: number,
    total: number,
    setStep: (value: number) => void,
    playing: boolean,
    setPlaying: (value: boolean) => void,
    speedMs: number,
    setSpeedMs: (value: number) => void,
}) {
    return (
        <div className={`${CARD} p-3 flex flex-wrap items-center gap-2 sticky top-0 z-20`}>
            <div className="flex items-center gap-1">
                <InstantTooltip label="Back to the start (before pick 1)">
                    <button className={BTN} onClick={() => setStep(0)} disabled={step === 0}>⏮</button>
                </InstantTooltip>
                <InstantTooltip label="Previous pick (←)">
                    <button className={BTN} onClick={() => setStep(step - 1)} disabled={step === 0}>◀</button>
                </InstantTooltip>
                <button
                    className={`${BTN} w-24 font-semibold`}
                    onClick={() => setPlaying(!playing)}
                    disabled={total === 0 || (!playing && step >= total)}
                >
                    {playing ? "⏸ Pause" : "▶ Play"}
                </button>
                <InstantTooltip label="Next pick (→)">
                    <button className={BTN} onClick={() => setStep(step + 1)} disabled={step >= total}>▶</button>
                </InstantTooltip>
                <InstantTooltip label="Jump to the end of the draft">
                    <button className={BTN} onClick={() => setStep(total)} disabled={step >= total}>⏭</button>
                </InstantTooltip>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-52">
                <input
                    type="range"
                    className="flex-1 accent-green-700"
                    min={0}
                    max={total}
                    value={step}
                    onChange={(event) => { setPlaying(false); setStep(Number(event.target.value)); }}
                    aria-label="Draft position"
                />
                <span className="text-sm font-semibold text-gray-700 whitespace-nowrap w-28 text-right">
                    Pick {step} / {total}
                </span>
            </div>

            <label className="text-xs text-gray-600 flex items-center gap-1">
                Speed
                <select
                    className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                    value={speedMs}
                    onChange={(event) => setSpeedMs(Number(event.target.value))}
                >
                    {SPEEDS.map((speed) => (
                        <option key={speed.ms} value={speed.ms}>{speed.label}</option>
                    ))}
                </select>
            </label>
        </div>
    );
}

// ---- Pick log -------------------------------------------------------------
// The draft in order. Clicking a row is the other fast-forward: jump straight to
// the state just after that pick. Picks past the current step are dimmed — they
// haven't happened yet in this replay, and showing them greyed keeps the list
// from re-laying out as you step.
function PickLog({ picks, step, setStep }: {
    picks: PlaybackPick[],
    step: number,
    setStep: (value: number) => void,
}) {
    const currentRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        currentRef.current?.scrollIntoView({ block: "nearest" });
    }, [step]);

    return (
        <div className={`${CARD} flex flex-col min-h-0`}>
            <div className="px-3 py-2 border-b border-gray-200">
                <h2 className={CARD_TITLE}>Pick log</h2>
                <p className="text-xs text-gray-500">Click a pick to jump there</p>
            </div>
            <div className="overflow-y-auto max-h-[32rem] lg:max-h-[46rem]">
                {picks.map((pick) => {
                    const isPast = pick.order <= step;
                    const isCurrent = pick.order === step;
                    return (
                        <button
                            key={pick.order}
                            ref={isCurrent ? currentRef : undefined}
                            onClick={() => setStep(pick.order)}
                            className={`w-full text-left px-2 py-1 text-xs border-b border-gray-100 flex items-center gap-1.5 hover:bg-yellow-50
                                ${isCurrent ? "bg-yellow-100 font-semibold" : isPast ? "bg-white" : "bg-gray-50 text-gray-400"}
                                ${pick.is_drafter ? "border-l-4 border-l-green-600" : "border-l-4 border-l-transparent"}`}
                        >
                            <span className="w-6 text-right text-gray-500 tabular-nums">{pick.order}</span>
                            <PositionBadge position={pick.position} />
                            <span className="flex-1 truncate">{pick.name}</span>
                            <span className="tabular-nums">{money(pick.price)}</span>
                            <span className="w-16 truncate text-gray-500">{pick.manager_name}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ---- The pick that just happened ------------------------------------------
function OnTheBlock({ pick, total }: { pick: PlaybackPick | null, total: number }) {
    if (!pick) {
        return (
            <div className={`${CARD} p-4`}>
                <h2 className={CARD_TITLE}>Before the draft</h2>
                <p className="text-sm text-gray-600 mt-1">
                    Nobody is off the board yet — every player below was available. Press ▶ or
                    drag the slider to walk through all {total} picks.
                </p>
            </div>
        );
    }
    return (
        <div className={`${CARD} p-4 ${pick.is_drafter ? "ring-2 ring-green-600" : ""}`}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h2 className={CARD_TITLE}>Pick {pick.order}{pick.is_drafter ? " — yours" : ""}</h2>
                <span className="text-xs text-gray-500">{pickClock(pick.drafted_at)}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
                <PositionBadge position={pick.position} />
                <span className="text-xl font-bold text-gray-800">{pick.name}</span>
                <span className="text-sm text-gray-600">→ {pick.manager_name}</span>
                {pick.position_slot && (
                    <span className="text-xs text-gray-500 border border-gray-300 rounded px-1">{pick.position_slot}</span>
                )}
            </div>
            <div className="flex items-baseline gap-4 mt-1 text-sm">
                <span className="text-2xl font-bold">{money(pick.price)}</span>
                <span className="text-gray-500">proj {money(pick.projected_price)}</span>
                <span className={`font-semibold ${diffText(pick.diff)}`}>
                    {signedMoney(pick.diff)} {pick.diff > 0 ? "over" : pick.diff < 0 ? "under" : "on"}
                </span>
            </div>
        </div>
    );
}

// ---- Available players at this moment --------------------------------------
// The reason the page exists. Each row also carries what the player went on to
// cost — "still on the board, and he went 40 picks later for $8" is the answer
// to "did I have a better option", and it is free to show because the pool row
// already knows where it came off the board.
function AvailableAtStep({ players, step, total }: {
    players: PlaybackPoolPlayer[],
    step: number,
    total: number,
}) {
    const [positions, setPositions] = useState<string[]>([]);
    const [search, setSearch] = useState("");
    const [limit, setLimit] = useState(50);

    useEffect(() => { setLimit(50); }, [step]);

    const togglePosition = (position: string) =>
        setPositions((current) => current.includes(position)
            ? current.filter((p) => p !== position)
            : [...current, position]);

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return players.filter((player) => {
            if (positions.length && !positions.includes(player.position)) return false;
            if (needle && !player.name.toLowerCase().includes(needle)) return false;
            return true;
        });
    }, [players, positions, search]);

    return (
        <div className={`${CARD} flex flex-col`}>
            <div className="px-3 py-2 border-b border-gray-200 flex flex-wrap items-center gap-2">
                <h2 className={CARD_TITLE}>
                    Available {step === 0 ? "before the draft" : `after pick ${step}`}
                </h2>
                <span className="text-xs text-gray-500">{filtered.length} players</span>
                <div className="flex-1" />
                <div className="flex gap-1">
                    {POSITION_ORDER.map((position) => (
                        <button
                            key={position}
                            onClick={() => togglePosition(position)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold leading-none border
                                ${positions.includes(position) ? "text-white" : "text-gray-600 bg-white"}`}
                            style={positions.includes(position)
                                ? { backgroundColor: positionColor(position), borderColor: positionColor(position) }
                                : { borderColor: positionColor(position) }}
                        >
                            {position}
                        </button>
                    ))}
                </div>
                <input
                    className="border border-gray-300 rounded px-2 py-0.5 text-xs w-32"
                    placeholder="Search…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-600 uppercase tracking-wide">
                        <tr>
                            <th className="text-left px-2 py-1">Player</th>
                            <th className="text-left px-2 py-1">Team</th>
                            <th className="text-right px-2 py-1">Proj $</th>
                            <th className="text-right px-2 py-1">ADP</th>
                            <th className="text-center px-2 py-1">Risk</th>
                            <th className="text-left px-2 py-1">What happened to him</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.slice(0, limit).map((player) => {
                            const risk = player.risk_score
                                ? getRiskColors(player.risk_score)
                                : undefined;
                            return (
                                <tr key={player.player_id} className="border-t border-gray-100">
                                    <td className="px-2 py-1">
                                        <span className="flex items-center gap-1.5">
                                            <PositionBadge position={player.position} />
                                            <span className={player.favorite === true ? "font-semibold text-red-700" : ""}>
                                                {player.name}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="px-2 py-1 text-gray-500">{player.team}</td>
                                    <td className="px-2 py-1 text-right tabular-nums">{money(player.projected_price)}</td>
                                    <td className="px-2 py-1 text-right tabular-nums text-gray-500">{player.adp_formatted}</td>
                                    <td className="px-2 py-1 text-center">
                                        {/* An unscored player (0) is silence, not a clean bill of
                                            health — draw nothing rather than a zero. */}
                                        {player.risk_score ? (
                                            <span className="inline-block rounded px-1 font-bold" style={risk}>
                                                {player.risk_score}
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className="px-2 py-1 text-gray-600">
                                        {player.drafted_order
                                            ? `went at #${player.drafted_order} for ${money(player.price || 0)} → ${player.manager_name}`
                                            : "never drafted"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {filtered.length > limit && (
                <button className="text-xs text-blue-700 hover:underline py-2" onClick={() => setLimit(limit + 100)}>
                    Show {Math.min(100, filtered.length - limit)} more of {filtered.length}
                </button>
            )}
            {step === total && total > 0 && (
                <p className="text-xs text-gray-500 px-2 py-1">End of the draft — these are the players nobody took.</p>
            )}
        </div>
    );
}

// ---- Managers at this moment -----------------------------------------------
// Budgets AND rosters as of the current pick: who could still have outbid you,
// and what they already had. Both are derived from the picks up to `step` — the
// server sends no per-frame state.
function ManagersAtStep({ managers, startingBudget }: {
    managers: {
        manager_id: number,
        manager_name: string,
        is_drafter: boolean,
        spent: number,
        remaining: number,
        picks: PlaybackPick[],
    }[],
    startingBudget: number,
}) {
    const [expanded, setExpanded] = useState<number[]>([]);
    const toggle = (managerId: number) =>
        setExpanded((current) => current.includes(managerId)
            ? current.filter((id) => id !== managerId)
            : [...current, managerId]);

    return (
        <div className={`${CARD} flex flex-col min-h-0`}>
            <div className="px-3 py-2 border-b border-gray-200">
                <h2 className={CARD_TITLE}>Budgets & rosters</h2>
                <p className="text-xs text-gray-500">As of the current pick</p>
            </div>
            <div className="overflow-y-auto max-h-[32rem] lg:max-h-[46rem]">
                {managers.map((manager) => {
                    const share = startingBudget > 0 ? (manager.spent / startingBudget) * 100 : 0;
                    const isOpen = expanded.includes(manager.manager_id);
                    return (
                        <div
                            key={manager.manager_id}
                            className={`border-b border-gray-100 ${manager.is_drafter ? "bg-green-50" : ""}`}
                        >
                            <button
                                className="w-full text-left px-2 py-1.5 hover:bg-gray-50"
                                onClick={() => toggle(manager.manager_id)}
                            >
                                <div className="flex items-baseline gap-1 text-xs">
                                    <span className="flex-1 truncate font-semibold text-gray-800">
                                        {manager.manager_name}{manager.is_drafter ? " (you)" : ""}
                                    </span>
                                    <span className="tabular-nums font-bold">{money(manager.remaining)}</span>
                                    <span className="text-gray-500">left</span>
                                </div>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <div className="flex-1 h-1.5 bg-gray-200 rounded">
                                        <div
                                            className="h-1.5 bg-gray-600 rounded"
                                            style={{ width: `${Math.min(100, share)}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-gray-500 tabular-nums w-16 text-right">
                                        {manager.picks.length} pick{manager.picks.length === 1 ? "" : "s"}
                                    </span>
                                </div>
                            </button>
                            {isOpen && (
                                <ul className="px-2 pb-1.5">
                                    {manager.picks.length === 0 && (
                                        <li className="text-[11px] text-gray-400">Nothing yet</li>
                                    )}
                                    {manager.picks.map((pick) => (
                                        <li key={pick.player_id} className="flex items-center gap-1 text-[11px] py-0.5">
                                            <PositionBadge position={pick.position} />
                                            <span className="flex-1 truncate">{pick.name}</span>
                                            <span className="tabular-nums">{money(pick.price)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function DraftPlaybackPage() {
    const { draftId: draftIdParam } = useParams();
    const navigate = useNavigate();

    const { data: playback, isLoading, isError } = useQuery({
        queryKey: ["draft_playback", draftIdParam],
        queryFn: () => draftPlaybackRetrieve(draftIdParam as string),
        select: (response: any) => response.data as DraftPlaybackOutput,
    });

    const picks = useMemo(() => playback?.picks || [], [playback]);
    const total = picks.length;

    // `step` is the whole model: how many picks have happened. Everything else on
    // the page is derived from it.
    const [step, setStep] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speedMs, setSpeedMs] = useState(1000);
    const [drafterOnly, setDrafterOnly] = useState(false);

    const clampStep = useCallback(
        (value: number) => setStep(Math.max(0, Math.min(total, value))),
        [total],
    );

    // Auto-play. It stops itself at the last pick rather than looping — the end
    // of the draft is a destination, not a frame to run past.
    useEffect(() => {
        if (!playing) return;
        if (step >= total) { setPlaying(false); return; }
        const timer = setTimeout(() => setStep((current) => Math.min(total, current + 1)), speedMs);
        return () => clearTimeout(timer);
    }, [playing, step, total, speedMs]);

    // Arrow keys step, space plays — a replay is watched with hands off the mouse.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
            if (event.key === "ArrowRight") { setPlaying(false); clampStep(step + 1); }
            else if (event.key === "ArrowLeft") { setPlaying(false); clampStep(step - 1); }
            else if (event.key === " ") { event.preventDefault(); setPlaying((current) => !current); }
            else return;
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [step, clampStep]);

    // Available after `step`: never drafted, or drafted later than here.
    const available = useMemo(() => {
        const pool = playback?.pool || [];
        return pool
            .filter((player) => player.drafted_order === null || player.drafted_order > step)
            .sort(byPriceThenFavoriteThenAdp);
    }, [playback, step]);

    const managersAtStep = useMemo(() => {
        const startingBudget = playback?.starting_budget || 0;
        const soFar = picks.slice(0, step);
        return (playback?.managers || []).map((manager) => {
            const managerPicks = soFar.filter((pick) => pick.manager_id === manager.manager_id);
            const spent = managerPicks.reduce((sum, pick) => sum + pick.price, 0);
            return {
                manager_id: manager.manager_id,
                manager_name: manager.manager_name,
                is_drafter: manager.is_drafter,
                spent,
                remaining: startingBudget - spent,
                picks: managerPicks,
            };
        });
    }, [playback, picks, step]);

    const currentPick = step > 0 ? picks[step - 1] : null;
    const logPicks = useMemo(
        () => (drafterOnly ? picks.filter((pick) => pick.is_drafter) : picks),
        [picks, drafterOnly],
    );

    return (
        <div className="min-h-screen bg-gray-100 py-4 px-2 sm:px-4">
            <div className="max-w-full mx-auto">
                <div className="bg-green-200 px-4 py-3 flex items-center gap-3 flex-wrap rounded-t-lg">
                    <button className={BTN} onClick={() => navigate(`/draft/${draftIdParam}`)}>
                        ← Back to board
                    </button>
                    <div className="flex-1 text-center min-w-40">
                        <h1 className="text-xl font-bold text-gray-800">Draft Playback</h1>
                        <p className="text-sm text-gray-600">{playback?.draft_name || `Draft ${draftIdParam}`}</p>
                    </div>
                    <button className={BTN} onClick={() => navigate(`/draft/${draftIdParam}/summary`)}>
                        Summary
                    </button>
                </div>

                {isLoading && <p className="p-4 text-sm text-gray-600">Loading draft…</p>}
                {isError && <p className="p-4 text-sm text-red-700">Could not load this draft's playback.</p>}

                {playback && total === 0 && (
                    <p className="p-4 text-sm text-gray-600">No picks have been made in this draft yet.</p>
                )}

                {playback && total > 0 && (
                    <div className="space-y-3 mt-3">
                        <TransportBar
                            step={step}
                            total={total}
                            setStep={(value) => { setPlaying(false); clampStep(value); }}
                            playing={playing}
                            setPlaying={setPlaying}
                            speedMs={speedMs}
                            setSpeedMs={setSpeedMs}
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)_16rem] gap-3 items-start">
                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-xs text-gray-700 px-1">
                                    <input
                                        type="checkbox"
                                        checked={drafterOnly}
                                        onChange={(event) => setDrafterOnly(event.target.checked)}
                                    />
                                    My picks only
                                </label>
                                <PickLog picks={logPicks} step={step} setStep={(value) => { setPlaying(false); setStep(value); }} />
                            </div>

                            <div className="space-y-3 min-w-0">
                                <OnTheBlock pick={currentPick} total={total} />
                                <AvailableAtStep players={available} step={step} total={total} />
                            </div>

                            <ManagersAtStep
                                managers={managersAtStep}
                                startingBudget={playback.starting_budget}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

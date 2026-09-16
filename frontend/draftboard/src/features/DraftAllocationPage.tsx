import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { draftAllocationRetrieve, draftAllocationTargetsSubmit } from "../lib/data";
import type {
    AllocationBucket, AllocationPlayer, AllocationRow, AllocationTargets, DraftAllocationOutput,
} from "../lib/draft.schemas";

// /draft/:draftId/allocation — "am I buying the draft I meant to buy".
//
// The plan is NOT one line per position, on purpose. RB and WR are the only
// positions worth steering: you buy several, and money moves between them right
// to the end — so they carry dollars AND a body count. QB/TE/DEF are
// one-and-done (fill the slot and there is nothing to pivot), so they share a
// single `other` reserve that exists mostly so the bench math can be honest. The
// bench is its own dollar line counted by SLOT, not position — anyone dropped in
// a BENCH slot is bench money, which is the point, since bench-priced players
// come off the board at random moments.
//
// The plan is EDITABLE here, mid-draft: spend $60 of a $70 WR plan on one
// receiver and the rest of your WRs get cheap by definition. That is a re-plan,
// not a shortage, and the page has to let you say so.
//
// Read-only-ish and server-fed through React Query — NOT Dexie, not the write
// queue — like Summary, Playback and Target Tiers. Every number comes from
// DraftReadService.get_allocation; the save POSTs back and redraws off the
// response.

// Live enough for draft day without hammering the API — same cadence as the
// target-tiers strip.
const POLL_MS = 15000;

// Okabe-Ito steps, as on the summary and playback pages: those sit one click
// away and must not disagree about what a WR looks like. OTHER and BENCH are
// buckets rather than positions, so they take neutrals.
const BUCKET_COLORS: Record<AllocationBucket, string> = {
    RB: "#0072B2",
    WR: "#009E73",
    OTHER: "#6b7280",
    BENCH: "#8c6d3f",
};
const BUCKET_LABELS: Record<AllocationBucket, string> = {
    RB: "RB",
    WR: "WR",
    OTHER: "QB / TE / DEF",
    BENCH: "Bench",
};
const BUCKET_NOTES: Record<AllocationBucket, string> = {
    RB: "Starter slots only — a RB in a BENCH slot is bench money.",
    WR: "Starter slots only — a WR in a BENCH slot is bench money.",
    OTHER: "One reserve, not three lines: these fill once and can't be pivoted.",
    BENCH: "By SLOT, not position — whoever lands in BENCH1-7 counts here.",
};

// Deviation from plan, not over/under PAY (that's the summary page, where red is
// overpay). Here red is SHORT, because the shortage is the thing this page was
// built to catch; amber is over-allocated, grey is on plan.
const SHORT_COLOR = "#b91c1c";
const OVER_COLOR = "#b45309";
const ON_PLAN_COLOR = "#6b7280";
const GOOD_COLOR = "#15803d";
const diffColor = (diff: number) => (diff < 0 ? SHORT_COLOR : diff > 0 ? OVER_COLOR : ON_PLAN_COLOR);
const diffText = (diff: number) =>
    diff < 0 ? "text-red-700" : diff > 0 ? "text-amber-700" : "text-gray-500";
const money = (value: number) => `$${Math.round(value)}`;
const dollarGap = (diff: number) =>
    diff === 0 ? "on plan" : diff < 0 ? `${money(Math.abs(diff))} short` : `${money(diff)} over`;
const bodyGap = (diff: number) =>
    diff === 0 ? "on plan" : diff < 0 ? `${Math.abs(diff)} short` : `${diff} extra`;
const percent = (share: number) => `${Math.round(share * 100)}%`;

const CARD = "bg-white rounded-lg shadow-sm border border-gray-200";
const CARD_TITLE = "text-sm font-bold text-gray-800 uppercase tracking-wide";

// The plan editor's six fields, laid out the way they're read.
const PLAN_FIELDS: { field: keyof AllocationTargets, label: string, count?: keyof AllocationTargets }[] = [
    { field: "target_rb", label: "RB $", count: "target_rb_count" },
    { field: "target_wr", label: "WR $", count: "target_wr_count" },
    { field: "target_other", label: "QB/TE/DEF $" },
    { field: "target_bench", label: "Bench $" },
];

function StatTile({ label, value, hint, color }: { label: string, value: string, hint?: string, color?: string }) {
    return (
        <div className={`${CARD} px-4 py-3 flex-1 min-w-40`}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold" style={color ? { color } : undefined}>{value}</div>
            {hint && <div className="text-xs text-gray-500">{hint}</div>}
        </div>
    );
}

// Headline 1 — will there still be bench money. headroom is the wallet minus
// what the plan still says to spend on starters, so it answers the question
// BEFORE the bench is the only thing left to buy.
function BenchOutlookWidget({ outlook }: { outlook: DraftAllocationOutput["bench_outlook"] }) {
    const ok = outlook.on_track;
    return (
        <div className={`${CARD} p-4`}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h2 className={CARD_TITLE}>Bench outlook</h2>
                <span
                    className="rounded px-2 py-0.5 text-xs font-bold text-white"
                    style={{ backgroundColor: ok ? GOOD_COLOR : SHORT_COLOR }}
                >
                    {ok ? "ON TRACK" : "SHORT"}
                </span>
            </div>
            <p className="text-3xl font-bold mt-1" style={{ color: ok ? GOOD_COLOR : SHORT_COLOR }}>
                {money(outlook.headroom)}
            </p>
            <p className="text-xs text-gray-600">
                left for the bench if the rest of the draft goes to plan
                {outlook.remaining_target > 0 && ` — you want ${money(outlook.remaining_target)} more there`}
                {outlook.remaining_target === 0 && " — the bench line is already covered"}
            </p>
            <p className={`text-sm font-semibold mt-1 ${ok ? "text-green-700" : "text-red-700"}`}>
                {ok
                    ? `${money(outlook.surplus)} to spare`
                    : `${money(Math.abs(outlook.surplus))} short of the bench plan`}
            </p>
            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600 space-y-0.5">
                <div className="flex justify-between"><span>Wallet</span><span className="font-semibold">{money(outlook.wallet)}</span></div>
                <div className="flex justify-between"><span>− starters still to buy (per plan)</span><span className="font-semibold">{money(outlook.starter_need)}</span></div>
                <div className="flex justify-between"><span>Bench spent so far</span><span className="font-semibold">{money(outlook.spent)} of {money(outlook.target)}</span></div>
            </div>
        </div>
    );
}

// Headline 2 — the RB/WR tilt: the split you planned against the one you're
// buying. This is the failure the page exists for.
function TiltWidget({ tilt }: { tilt: DraftAllocationOutput["tilt"] }) {
    const plannedRb = tilt.planned_rb_share;
    const actualRb = tilt.actual_rb_share;
    const off = tilt.dollars;
    const heavy = off < 0 ? "WR" : "RB";
    return (
        <div className={`${CARD} p-4`}>
            <h2 className={CARD_TITLE}>RB / WR tilt</h2>
            <p className="text-xs text-gray-500 mb-2">
                Starter dollars only. Measured at what you have already committed to RB+WR, so it
                reads straight rather than waiting for the plan's totals.
            </p>

            {plannedRb === null && <p className="text-sm text-gray-600">No RB/WR dollars planned yet.</p>}
            {plannedRb !== null && (
                <div className="space-y-2">
                    <TiltBar label="Planned" rbShare={plannedRb} />
                    {actualRb === null
                        ? <p className="text-sm text-gray-600">Nothing drafted at RB or WR yet.</p>
                        : <TiltBar label="Actual" rbShare={actualRb} />}
                </div>
            )}

            {actualRb !== null && plannedRb !== null && (
                <p className={`mt-2 text-sm font-bold ${off === 0 ? "text-gray-500" : "text-amber-700"}`}>
                    {off === 0
                        ? "Dead on the planned split."
                        : `${money(Math.abs(off))} too ${heavy}-heavy for the plan.`}
                </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
                Committed so far: RB {money(tilt.rb_actual)} · WR {money(tilt.wr_actual)}
            </p>
        </div>
    );
}

function TiltBar({ label, rbShare }: { label: string, rbShare: number }) {
    const rbPct = Math.max(0, Math.min(1, rbShare)) * 100;
    return (
        <div>
            <div className="flex justify-between text-[11px] font-semibold text-gray-600">
                <span>{label}</span>
                <span>RB {percent(rbShare)} · WR {percent(1 - rbShare)}</span>
            </div>
            <div className="flex h-5 rounded overflow-hidden bg-gray-100">
                <div style={{ width: `${rbPct}%`, backgroundColor: BUCKET_COLORS.RB }} />
                <div style={{ width: `${100 - rbPct}%`, backgroundColor: BUCKET_COLORS.WR }} />
            </div>
        </div>
    );
}

// One measured bar against the shared dollar scale, with the target drawn as a
// tick ON the track — the gap between bar end and tick IS the shortage.
function MeasuredBar({
    label, value, target, diff, scale, color, showTarget,
}: {
    label: string, value: number, target: number, diff: number,
    scale: number, color: string, showTarget: boolean,
}) {
    return (
        <div className="flex items-center gap-2">
            <div className="w-12 shrink-0 text-[11px] font-semibold text-gray-500 uppercase text-right">{label}</div>
            <div className="relative flex-1 h-5 bg-gray-50 rounded">
                <div
                    className="absolute inset-y-0.5 left-0 rounded"
                    style={{ width: `${Math.min(100, (value / scale) * 100)}%`, backgroundColor: color }}
                />
                {showTarget && (
                    <div
                        className="absolute -inset-y-0.5 w-0.5 bg-gray-800"
                        style={{ left: `${Math.min(100, (target / scale) * 100)}%` }}
                        title={`Target ${money(target)}`}
                    />
                )}
            </div>
            <div className="w-14 shrink-0 text-right text-xs font-bold text-gray-800">{money(value)}</div>
            <div className={`w-20 shrink-0 text-right text-xs font-semibold ${showTarget ? diffText(diff) : "text-gray-400"}`}>
                {showTarget ? dollarGap(diff) : "—"}
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
                    <span className="flex-1 truncate text-gray-800">
                        {player.name} <span className="text-gray-400">{player.position}</span>
                    </span>
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

function BucketCard({ row, scale, hasTargets }: { row: AllocationRow, scale: number, hasTargets: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const tracksBodies = row.target_count !== undefined;
    return (
        <div className={`${CARD} p-3`}>
            <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                    <span
                        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white leading-none"
                        style={{ backgroundColor: BUCKET_COLORS[row.key] }}
                    >
                        {row.key}
                    </span>
                    <span className="text-sm font-bold text-gray-800">{BUCKET_LABELS[row.key]}</span>
                    <span className="text-xs text-gray-500">
                        target {hasTargets ? money(row.target) : "—"}
                        {tracksBodies && hasTargets && ` over ${row.target_count} players`}
                    </span>
                </div>
                <button className="text-xs text-blue-700 hover:underline" onClick={() => setExpanded(!expanded)}>
                    {expanded ? "Hide players" : `${row.actual_count} drafted · ${row.planned_count} planned`}
                </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-2">{BUCKET_NOTES[row.key]}</p>

            <div className="space-y-1">
                <MeasuredBar
                    label="Actual" value={row.actual} target={row.target} diff={row.actual_diff}
                    scale={scale} color={BUCKET_COLORS[row.key]} showTarget={hasTargets}
                />
                <MeasuredBar
                    label="Plan" value={row.planned} target={row.target} diff={row.planned_diff}
                    scale={scale} color={`${BUCKET_COLORS[row.key]}66`} showTarget={hasTargets}
                />
            </div>

            {/* Bodies are flagged apart from dollars: one $40 RB instead of two
                $20s is on budget and a body light, and only the count says so. */}
            {tracksBodies && hasTargets && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-gray-100 text-xs">
                    <span className="text-gray-500">Bodies</span>
                    <span className={`font-semibold ${diffText(row.actual_count_diff as number)}`}>
                        drafted {row.actual_count} of {row.target_count} — {bodyGap(row.actual_count_diff as number)}
                    </span>
                    <span className={`font-semibold ${diffText(row.planned_count_diff as number)}`}>
                        planned {row.planned_count} — {bodyGap(row.planned_count_diff as number)}
                    </span>
                </div>
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

// The plan editor. Editable mid-draft on purpose (see the file header) — it is
// the only writer on this page, and it can only touch these six fields.
function PlanEditor({
    targets, startingBudget, onSave, saving, savedAt,
}: {
    targets: AllocationTargets, startingBudget: number,
    onSave: (next: AllocationTargets) => void, saving: boolean, savedAt: number | null,
}) {
    const [draftTargets, setDraftTargets] = useState<AllocationTargets>(targets);
    // The payload keeps arriving every 15s; adopt the server's copy whenever it
    // actually changes, so a save elsewhere isn't masked by this form's state —
    // but never mid-typing on an unchanged payload.
    useEffect(() => { setDraftTargets(targets); }, [JSON.stringify(targets)]);

    const total = PLAN_FIELDS.reduce((sum, row) => sum + (draftTargets[row.field] || 0), 0);
    const remainder = startingBudget - total;
    const dirty = PLAN_FIELDS.some((row) =>
        draftTargets[row.field] !== targets[row.field]
        || (row.count && draftTargets[row.count] !== targets[row.count]));

    const set = (field: keyof AllocationTargets, value: string) =>
        setDraftTargets({ ...draftTargets, [field]: Math.max(0, parseInt(value) || 0) });

    return (
        <div className={`${CARD} p-4`}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h2 className={CARD_TITLE}>The plan</h2>
                <span className="text-xs text-gray-500">
                    Re-plan freely — buying one $60 WR makes the rest of your WRs cheap by definition.
                </span>
            </div>
            <div className="flex flex-wrap gap-4 mt-2">
                {PLAN_FIELDS.map((row) => (
                    <div key={row.field} className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-700 w-24" htmlFor={row.field}>{row.label}</label>
                        <input
                            id={row.field}
                            type="number"
                            min={0}
                            className="w-20 bg-gray-100 border rounded py-1 px-2 text-sm"
                            value={draftTargets[row.field]}
                            onChange={(e) => set(row.field, e.target.value)}
                        />
                        {row.count && (
                            <>
                                <span className="text-xs text-gray-500">over</span>
                                <input
                                    id={row.count}
                                    type="number"
                                    min={0}
                                    className="w-14 bg-gray-100 border rounded py-1 px-2 text-sm"
                                    value={draftTargets[row.count]}
                                    onChange={(e) => set(row.count as keyof AllocationTargets, e.target.value)}
                                />
                                <span className="text-xs text-gray-500">players</span>
                            </>
                        )}
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-3">
                <button
                    className="bg-green-600 text-white rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
                    disabled={!dirty || saving}
                    onClick={() => onSave(draftTargets)}
                >
                    {saving ? "Saving…" : "Save plan"}
                </button>
                {dirty && !saving && <span className="text-xs text-amber-700 font-semibold">unsaved changes</span>}
                {!dirty && savedAt && <span className="text-xs text-green-700 font-semibold">saved</span>}
                {/* Shown, not enforced: leaving money loose (or knowingly
                    planning over) is a legitimate plan. */}
                <span className={`text-xs font-semibold ${remainder === 0 ? "text-gray-600" : remainder > 0 ? "text-blue-700" : "text-red-700"}`}>
                    {money(total)} of {money(startingBudget)} allocated
                    {remainder > 0 && ` — ${money(remainder)} unallocated`}
                    {remainder < 0 && ` — ${money(Math.abs(remainder))} over budget`}
                </span>
            </div>
        </div>
    );
}

export default function DraftAllocationPage() {
    const { draftId: draftIdParam } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [savedAt, setSavedAt] = useState<number | null>(null);

    const queryKey = ["draft_allocation", draftIdParam];
    const { data: allocation, isLoading, isError } = useQuery({
        queryKey,
        queryFn: () => draftAllocationRetrieve(draftIdParam as string),
        select: (response: any) => response.data as DraftAllocationOutput,
        refetchInterval: POLL_MS,
    });

    const saveTargets = useMutation({
        mutationFn: (next: AllocationTargets) =>
            draftAllocationTargetsSubmit(draftIdParam as string, next),
        onSuccess: (response: any) => {
            // The POST returns the recomputed payload, so seed the cache with it
            // instead of waiting out a refetch.
            queryClient.setQueryData(queryKey, response);
            setSavedAt(Date.now());
        },
    });

    const rows = allocation?.rows || [];
    // One shared dollar scale across every bucket, so the bars are comparable
    // between cards — a per-card scale would make an $18 bench look like an $88 RB.
    const scale = useMemo(
        () => Math.max(1, ...rows.map((row) => Math.max(row.target, row.actual, row.planned))),
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
                        <h1 className="text-xl font-bold text-gray-800">Allocation</h1>
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
                                No manager in this draft is flagged as the drafter, so there is no roster
                                to measure. Mark one with a <code>*</code> when creating a draft.
                            </p>
                        )}
                        {saveTargets.isError && (
                            <p className={`${CARD} p-4 text-sm text-red-700`}>Could not save the plan — try again.</p>
                        )}

                        <PlanEditor
                            targets={allocation.targets}
                            startingBudget={allocation.starting_budget}
                            onSave={(next) => saveTargets.mutate(next)}
                            saving={saveTargets.isPending}
                            savedAt={savedAt}
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <BenchOutlookWidget outlook={allocation.bench_outlook} />
                            <TiltWidget tilt={allocation.tilt} />
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <StatTile
                                label="Drafted"
                                value={money(allocation.actual_total)}
                                hint={`of ${money(allocation.starting_budget)} starting budget`}
                            />
                            <StatTile
                                label="Wallet"
                                value={money(allocation.budget_remaining)}
                                hint="starting budget minus actual spend"
                            />
                            <StatTile
                                label="Plan total"
                                value={money(allocation.planned_total)}
                                hint="budget panel, actual price where drafted"
                            />
                            <StatTile
                                label="Allocated"
                                value={allocation.has_targets ? money(allocation.target_total) : "—"}
                                hint={allocation.has_targets ? "the plan above" : "no plan entered"}
                            />
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                            {rows.map((row) => (
                                <BucketCard
                                    key={row.key}
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
                                            <th className="text-left py-1 pr-2">Bucket</th>
                                            <th className="text-right py-1 px-2">Target</th>
                                            <th className="text-right py-1 px-2">Drafted</th>
                                            <th className="text-right py-1 px-2">vs target</th>
                                            <th className="text-right py-1 px-2">Plan</th>
                                            <th className="text-right py-1 px-2">vs target</th>
                                            <th className="text-right py-1 pl-2">Bodies</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => (
                                            <tr key={row.key} className="border-b border-gray-100 last:border-0">
                                                <td className="py-1 pr-2 font-semibold text-gray-800">{BUCKET_LABELS[row.key]}</td>
                                                <td className="text-right py-1 px-2">{allocation.has_targets ? money(row.target) : "—"}</td>
                                                <td className="text-right py-1 px-2 font-semibold">{money(row.actual)}</td>
                                                <td className={`text-right py-1 px-2 font-semibold ${allocation.has_targets ? diffText(row.actual_diff) : "text-gray-400"}`}>
                                                    {allocation.has_targets ? dollarGap(row.actual_diff) : "—"}
                                                </td>
                                                <td className="text-right py-1 px-2">{money(row.planned)}</td>
                                                <td className={`text-right py-1 px-2 ${allocation.has_targets ? diffText(row.planned_diff) : "text-gray-400"}`}>
                                                    {allocation.has_targets ? dollarGap(row.planned_diff) : "—"}
                                                </td>
                                                <td className="text-right py-1 pl-2 text-gray-600">
                                                    {row.target_count === undefined
                                                        ? `${row.actual_count} / ${row.planned_count}`
                                                        : `${row.actual_count} of ${row.target_count} (plan ${row.planned_count})`}
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
                                A pick in BENCH1-7 is bench money whatever he plays; every other pick is
                                RB / WR by the player's position (a WR in FLEX2 is WR spend), with
                                QB/TE/DEF pooled. "Plan" is the budget panel's own arithmetic: the actual
                                price where a budgeted player is already off the board, the projected
                                price otherwise.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

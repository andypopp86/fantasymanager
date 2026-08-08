import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftAvailablePlayersRetrieve, draftManagerPicksRetrieve, draftBudgetedPicksRetrieve, draftWatchedPicksRetrieve } from "../lib/data";
import { hydrateDraft } from "../lib/db";
import { DraftBoard } from "../features/DraftBoard";
import { AvailablePlayers } from "../features/AvailablePlayers";
import WatchedPlayers from "../features/WatchedPlayers";
import { useDraftState } from "../hooks/useDraftState";
import { useDraftData } from "../hooks/useDraftData";
import { useIsMobile } from "../hooks/useIsMobile";
import { BudgetedPicks } from "./BudgetedPicks";
import { NominationArea } from "./NominationArea";
import { BudgetPerSlot } from "./BudgetPerSlot";
import RebudgetModal from "./RebudgetModal";
import { POSITION_BG_COLORS, POSITION_FG_COLORS } from "../utils/colors";

type DraftProps = {
    draftDetails: any
};

// Data flow: React Query fetches → hydrateDraft replaces this draft's Dexie
// rows → useDraftData projects them live into the shapes components consume.
// The XState machine contributes only flow state (nomination, drag). If the
// server is unreachable, the queries fail but last session's rows are still
// in Dexie — the board keeps working, and queued writes surface via the
// waiting-to-sync counter in the title row.
export default function Draft({draftDetails}: DraftProps) {
    const navigate = useNavigate();
    // Hidden by default: just a button next to Back. Shown: the panel keeps
    // its usual place in the sidebar.
    const [showWatchList, setShowWatchList] = useState(false);
    const [showRebudget, setShowRebudget] = useState(false);
    // Phones can't show the sidebar beside the board, so the panels become
    // tabs. Nomination survives tab switches (it lives in the flow machine),
    // which is what makes "tap a player, switch to Board, tap a slot" work.
    const isMobile = useIsMobile();
    const [mobileTab, setMobileTab] = useState<"players" | "board" | "budget">("players");
    const { data: playersData } = useQuery({
        queryKey: ["available_players", draftDetails.id],
        queryFn: () =>
            draftAvailablePlayersRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { data: managerPicks } = useQuery({
        queryKey: ["manager_picks", draftDetails.id],
        queryFn: () =>
            draftManagerPicksRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { data: budgetedPicks } = useQuery({
        queryKey: ["budgeted_picks", draftDetails.id],
        queryFn: () =>
            draftBudgetedPicksRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { data: watchedPlayers } = useQuery({
        queryKey: ["watch_picks", draftDetails.id],
        queryFn: () =>
            draftWatchedPicksRetrieve(draftDetails.id),
        select: (data) => {
            return data.data;
        }
    })

    const { draftStateRef, flowContext } = useDraftState();
    const { send: draftSend } = draftStateRef;
    const data = useDraftData(draftDetails.id);

    // Fresh server data replaces this draft's local rows wholesale (the
    // server stays the source of truth whenever it's reachable).
    useEffect(() => {
        if (!draftDetails.id || !playersData || !managerPicks || !budgetedPicks || !watchedPlayers) return;
        hydrateDraft(draftDetails.id, {
            draftDetails,
            availablePlayers: playersData,
            managerPicks,
            budgetedPicks,
            watchedPlayers,
        }).catch((err) => console.error("Failed to hydrate draft data", err));
    }
    , [playersData, draftDetails.id, managerPicks, budgetedPicks, watchedPlayers]);

    // Switching drafts: abandon in-flight nomination/drag state.
    useEffect(() => {
        draftSend({ type: "reset_flow" });
    }, [draftDetails.id, draftSend]);

    const draftContext = {
        ...data,
        ...flowContext,
        draftId: draftDetails.id,
        draftDetails,
    };

    const btnClass = "btn border border-gray-400 rounded-md px-3 py-1.5 text-sm hover:bg-gray-100 active:bg-gray-200";
    const nominatedPlayer = flowContext.nominatedPlayer;
    const hasNomination = !!(nominatedPlayer && nominatedPlayer.player_id);

    // The four panels, built once and placed differently per layout so the
    // mobile and desktop arrangements can't drift apart (and so switching tabs
    // doesn't remount a second AvailablePlayers with its own filter state).
    const playersPanel = <AvailablePlayers draftContext={draftContext} draftSend={draftSend} />;
    const watchPanel = showWatchList
        ? <WatchedPlayers draftContext={draftContext} draftSend={draftSend} onHide={() => setShowWatchList(false)} />
        : null;
    const budgetPanel = (
        <div className="flex flex-col gap-2">
            <NominationArea draftContext={draftContext} draftSend={draftSend} />
            <BudgetPerSlot draftContext={draftContext} />
            <BudgetedPicks draftContext={draftContext} draftSend={draftSend} />
        </div>
    );
    const boardPanel = <DraftBoard draftContext={draftContext} draftSend={draftSend} />;

    // On a phone the Nomination panel is a tab away while you're tapping slots
    // on the Board tab, so who's on the block and their price ride along at the
    // top of every tab.
    const nominationBar = hasNomination && (
        <div className="flex items-center gap-2 px-2 py-1 border-b border-gray-200">
            <span
                className="flex-1 min-w-0 truncate rounded px-2 py-1 text-sm font-semibold"
                style={{
                    background: POSITION_BG_COLORS[nominatedPlayer.position],
                    color: POSITION_FG_COLORS[nominatedPlayer.position],
                }}
            >
                {nominatedPlayer.name} ({nominatedPlayer.position})
            </span>
            <input
                type="number"
                min={1}
                className="w-20 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                value={flowContext.nominationPrice}
                onChange={(e) => draftSend({ type: "set_nomination_price", price: parseInt(e.target.value) || 0 })}
                title="Winning price"
            />
            <button
                className="border border-gray-400 rounded-md px-2 py-1 text-sm bg-white"
                onClick={() => draftSend({ type: "cancel_nomination" })}
                title="Cancel nomination"
            >
                ✕
            </button>
        </div>
    );

    const tabs = [
        { key: "players", label: "Players" },
        { key: "board", label: "Board" },
        { key: "budget", label: "Budget" },
    ] as const;

  return (
    <>
    <div className="flex flex-wrap items-center gap-2 p-1">
      <div className="flex flex-wrap gap-2">
        <button className={btnClass} onClick={() => navigate("/")}>Back</button>
        {!showWatchList && (
            <button
                className={btnClass}
                onClick={() => setShowWatchList(true)}
                title="Show WatchList"
            >
                WatchList ▸
            </button>
        )}
        <button
            className={btnClass}
            onClick={() => navigate(`/draft/${draftDetails.id}/plan`)}
            title="Merge a saved plan into the budget"
        >
            Plans
        </button>
        <button
            className={btnClass}
            onClick={() => setShowRebudget(true)}
            title="Suggest a budget from favorited players by strategy"
        >
            Rebudget
        </button>
      </div>
      <div className="flex w-full lg:w-auto lg:flex-1 gap-1">
        {data.pendingWrites > 0 && (
            <p className="w-1/3 bg-orange-200 text-center text-sm font-semibold flex items-center justify-center">
                ⏳ {data.pendingWrites} change{data.pendingWrites === 1 ? "" : "s"} waiting to sync
            </p>
        )}
        <p className="flex-1 bg-green-200 text-center text-lg font-bold truncate">{draftDetails.draft_name}</p>
      </div>
    </div>
    {showRebudget && data.hydrated && (
        <RebudgetModal draftContext={draftContext} onClose={() => setShowRebudget(false)} />
    )}
    {data.hydrated && (isMobile ? (
        <>
            <div className="sticky top-0 z-30 bg-white border-b border-gray-300 shadow-sm">
                {nominationBar}
                <div className="flex">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setMobileTab(tab.key)}
                            className={"flex-1 py-2 text-sm font-semibold bg-white rounded-none border-b-2 " + (
                                mobileTab === tab.key
                                    ? "border-blue-500 text-blue-600"
                                    : "border-transparent text-gray-500"
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="p-1">
                {mobileTab === "players" && playersPanel}
                {mobileTab === "board" && boardPanel}
                {mobileTab === "budget" && (
                    <div className="flex flex-col gap-2">
                        {budgetPanel}
                        {watchPanel}
                    </div>
                )}
            </div>
        </>
    ) : (
        <div className="draftboard-grid">
            <div className="draft-sidebar flex gap-2">
                {playersPanel}
                {watchPanel}
                {budgetPanel}
            </div>
            <div className="draft-main">
                {boardPanel}
            </div>
        </div>
    ))}
    </>
  )
}

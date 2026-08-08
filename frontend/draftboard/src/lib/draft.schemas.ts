
export type Draft = {
    id: number,
    year: number,
    draft_name: string,
    drafter: string,
    projected_draft: any,
    saved_slots: any,
    locked: boolean,
    starting_budget: number,
    limit_qb: number,
    limit_rb: number,
    limit_wr: number,
    limit_te: number,
    limit_def: number,
}

export interface DraftListRetrieveOutput {
    drafts: Draft[]
}

// /api/me/ — is_staff is the role flag: staff = drafter, non-staff = spectator
export interface CurrentUserOutput {
    email: string,
    username: string,
    is_staff: boolean,
}
export interface DraftRetrieveOutput {

}


export type Player = {
    name: string,
    position: string,
    team: string,
    bye_week: number,
    price: number,
}

export type AvailablePlayer = {
    drafted: boolean,
    last_update_time: string,
    manager: Manager,
    player: Player,
    price: number,
}

export interface AvailablePlayersRetrieveOutput {
    data: AvailablePlayer[]
}

export interface DraftRetrieveParams {
    draft_id: number;
}

export interface DraftSubmitPickParams {
    price: number;
    position_slot: string;
}


export interface DraftBudgetPickParams {
    budget_position: string;
    projected_price: number;
}

export interface DraftCreateParams {
    draft_name: string;
    managers: string;
    starting_budget: number;
    rounds: number;
    limit_qb: number;
    limit_rb: number;
    limit_wr: number;
    limit_te: number;
    limit_def: number;
    available_to_spectators: boolean;
}

export type Manager = {
    id: number,
    name: string,
    budget: number,
    drafter: boolean,
    position: number,
}

export interface DraftManagersOutput {
    managers: Manager[]
}

export type DraftPick = {
    name: string,
    price: number,
    position: string,
}
export interface DraftSlotOutput {
    manager: string,
    manager_position: number,
    pick: DraftPick
    round: number,
    position: string,
}

export type DraftSlot = {
    manager: string,
    manager_position: number,
    round: number,
    pick: DraftPick
}

export type DraftRound = {
    round: DraftSlot[]
}

export interface DraftSlotsRetrieveOutput {
    draft_rounds: DraftRound[]
}

export interface DraftSubmitPickOutput {
    data: DraftSlot
}

// ---------------------------------------------------------------------------
// Client-side data shapes (NOT the API param/output types above).
// Dexie (lib/db.ts) is the client-side database: server fetches hydrate its
// tables, components read it via useDraftData/liveQuery, and every mutation
// goes through lib/mutations.ts. The XState machine holds FLOW state only
// (nomination, drag) — see DraftFlowContext at the bottom.
// ---------------------------------------------------------------------------

// Roster/budget slot name from the server's BUDGET_POSITIONS:
// "QB1", "RB1"…"RB2", "WR1"…"WR2", "TE1", "FLEX1"…"FLEX2", "DEF1", "BENCH1"…"BENCH7".
export type SlotName = string;

// A player occupying (or targeted for) a slot. Draft-board picks and budget
// picks share this shape with different fields populated; an empty slot's
// pick has player_id === "" (server) or null (client-side unbudget).
export type SlotPick = {
    id?: number | null,
    pick_id?: number | null,
    player_id: number | string | null,
    name?: string,             // draft-board picks
    player_name?: string | null, // budget picks
    position: string,
    price?: number | string,
    projected_price?: number | string,
    actual_price?: number | string,
    budget_position?: SlotName,
    status?: string,
    slot?: SlotName,
}

// One roster/budget slot: eligibility rules plus its (possibly empty) pick.
export type PickSlot = {
    order?: number,
    position_slot?: SlotName,
    allowed_positions: string[],
    pick: SlotPick,
}

// A manager as the draft machine sees them (richer than the API `Manager`).
export type SlottedManager = {
    manager_id: number,
    manager_name: string,
    manager_position: number,
    manager_budget: number | string,
    is_drafter: boolean,
    draft_picks: Record<SlotName, PickSlot>,
}

// Full player detail as loaded for the available-players list.
export type PlayerDetail = {
    player_id: number | string,
    name: string,
    position: string,
    projected_price?: number | string,
    adp_price?: number | string,
    // Tri-state: true = target, null/undefined = neutral, false = avoid.
    favorite?: boolean | null,
    notes?: string | null,
    target_type?: string | null,
    team?: Record<string, any> | null,
    [stat: string]: any, // points, yards, tds, … (stat-selector fields)
}

// Available-players row: the player plus draft-level pricing/stats.
export type UndraftedPlayer = {
    player: PlayerDetail,
    projected_price: number | string,
    [stat: string]: any,
}

export type WatchedPlayer = {
    player_id: number | string,
    name: string,
    position: string,
    projected_price: number | string,
}

// ---- DraftPlan (standalone budget templates, /api/drafts/draft/plans/) ----

export type DraftPlanPlayer = {
    id: number,
    player_id: number | string,
    name: string,
    position: string,
    projected_price: number | string,
    override_price: number | string | null,
}

export type DraftPlanOutput = {
    id: number,
    name: string,
    year: number,
    date_created: string,
    // Slot name -> planned player (null for slots the plan leaves open).
    slots: Record<SlotName, DraftPlanPlayer | null>,
}

// ---- Target tiers (/api/drafts/draft/<id>/target_tiers/) ------------------
// Manual tiering of Player.target_tier (1 = best tier; 0 = untiered, omitted).
// The server only returns players still UNDRAFTED in that draft.

export type TargetTierPlayer = {
    player_id: number,
    name: string,
    position: string,
    target_tier: number,
    adp_formatted: number | string,
    favorite: boolean | null,
    notes: string | null,
    team: string | null,
    projected_price: number | string,
}

export type TargetTierOutput = {
    tier: number,
    players: TargetTierPlayer[],
}

// ---- Dexie table rows (lib/db.ts) -----------------------------------------
// Modeled on the SERVER's rows, not the UI's lists: a DraftPickRow mirrors
// DraftPick (one row per draft+player; "available" is just drafted=false),
// BudgetPickRow mirrors BudgetPlayer. UI lists are projections (useDraftData).

export type DraftPickRow = {
    draftId: number,
    player_id: number | string,
    drafted: boolean, // not indexed (IndexedDB can't index booleans); partition in JS
    manager_id: number | null,
    price: number | null,
    slot: SlotName | null,
    pick_id?: number | string | null,
    player: PlayerDetail,
    projected_price: number | string,
    // points, yards, tds, rush_attempts, receptions, targets, first_downs …
    stats: Record<string, number | string | null>,
}

export type BudgetPickRow = {
    draftId: number,
    player_id: number | string,
    slot: SlotName,
    player_name: string,
    position: string,
    projected_price: number | string,
    actual_price: number | string,
    status: string,
}

export type WatchPickRow = {
    draftId: number,
    player_id: number | string,
    name: string,
    position: string,
    projected_price: number | string,
}

// One queued API write, recorded when the server was unreachable (or while
// older writes were still queued, to preserve ordering). Flushed FIFO by
// lib/writeQueue.ts; `op` names an entry in its OP_SENDERS registry.
export type PendingWriteRow = {
    id?: number, // auto-increment
    draftId: number,
    op: string,
    args: Record<string, any>,
    createdAt: string,
}

// Per-draft singleton row: details, managers (identity only — budgets are
// DERIVED from drafted rows, never stored), and the slot template.
export type DraftMetaRow = {
    draftId: number,
    savedAt: string,
    draftDetails: Draft,
    managers: {
        manager_id: number,
        manager_name: string,
        manager_position: number,
        is_drafter: boolean,
    }[],
    slots: { slot: SlotName, order: number, allowed_positions: string[] }[],
}

// ---- XState flow context ---------------------------------------------------
// The machine holds ONLY in-flight interaction state; all draft data lives in
// Dexie and reaches components via useDraftData.
export type DraftFlowContext = {
    nominatedPlayer: PlayerDetail | Record<string, never>,
    nominationPrice: number,
    draggedPlayer: { player: PlayerDetail, projected_price?: number | string } | Record<string, never>,
    budgetSlotTargeted: SlotName | Record<string, never>,
}


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
}

export interface FavoritePlayerParams {
    favorite: boolean;
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
// Draft-machine context shapes (client-side state, NOT the API types above).
// This is the single source of truth for what lives in the draftStateMachine
// context — and therefore exactly what a Dexie snapshot (lib/db.ts) persists.
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
    favorite?: boolean,
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

// The draftStateMachine context. Persisted verbatim to Dexie on every
// transition; restored verbatim when the server is unreachable.
export type DraftContext = {
    draftId: number,
    drafterId: number,
    draftDetails: Draft | Record<string, never>,
    nominatedPlayer: PlayerDetail | Record<string, never>,
    nominationPrice: number,
    managers: SlottedManager[],
    undraftedPlayers: UndraftedPlayer[],
    draftedPlayers: any[], // TODO in the machine; unused
    watchedPlayers: WatchedPlayer[],
    budgetedPlayers: Record<SlotName, PickSlot>,
    draggedPlayer: { player: PlayerDetail, projected_price?: number | string } | Record<string, never>,
    budgetSlotTargeted: SlotName | Record<string, never>,
    budgetSpent: number,
    planChanges: any[],
    // Dexie-restore flags: true/timestamp when this session was hydrated from
    // a local snapshot because the server was unreachable.
    restoredFromSnapshot: boolean,
    snapshotSavedAt: string | null,
}

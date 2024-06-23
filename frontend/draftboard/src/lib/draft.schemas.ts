
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

export type Manager = {
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
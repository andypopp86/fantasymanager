export interface DraftRetrieveOutput {

}

export interface DraftRetrieveParams {
    draft_id: number;
}

export interface DraftManagersOutput {
    name: string,
    budget: number,
    drafter: boolean,
    position: number,
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

export type DraftRound = {
    round: DraftSlotOutput[]
}
export type DraftSelectedEvent = {
    type: "draft_selected";
    draft_id: string;
};

export type NominatePlayerEvent = {
    type: "nominate_player";
    player_id: string;
    player_name: string;
};

export type DraftPickSubmittedEvent = {
    type: "draft_pick_submitted";
    player: any;
    team: any;
};

export type DraftAppEvent = 
    | DraftSelectedEvent
    | NominatePlayerEvent
    | DraftPickSubmittedEvent;
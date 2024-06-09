from django.http import Http404

from core.services.base import BaseService
from django.db.models import F, Case, When


from draft import models as d 
from draft.utils import (
    weather_rank_to_quint, team_rank_to_quint,
    STOPLIGHT_COLORS
)

class DraftReadService(BaseService):

    def get_draft_detail(
        self,
        draft_id
    ):
        draft = d.Draft.objects.filter(id=draft_id).first()
        if not draft:
            raise Http404
        return draft
    

def init_managers(managers, draft_dict):
    for manager in managers:
        if manager.drafter is True:
            drafter = manager
        draft_dict[manager.id] = []
    return drafter

def init_adp_rounds(players, teams):
    adp_rounds = {}
    for i in range(1, 100):
        adp_rounds[i] = []

    round = 1
    for idx, player in enumerate(players, start=1):
        if idx % teams == 0:
            round += 1
        adp_rounds[round].append(player)

def enrich_picks_data(picks_by_adp, draft, draft_dict):
    budgeted_players = draft.budgeted_players.select_related("player").filter(status__in=('drafted', 'budgeted'))
    budget_dict = {bp.player.id: bp for bp in budgeted_players}
    for pick in picks_by_adp:
        budgeted_player = budget_dict.get(pick.player.id, None)
        pick.budgeted = True if budgeted_player else False

        early_season_pos =  f'early_season_{pick.player.position.lower()}'
        early_season_rank = getattr(pick.player.team, early_season_pos)  if pick.player.team and pick.player.position in ('QB', 'WR', 'RB', 'TE', 'DEF') else 0
        early_season_rank = 0 if not early_season_rank else early_season_rank
        pick.early_season_rank = team_rank_to_quint(early_season_rank)
        playoff_pos =  f'playoff_{pick.player.position.lower()}'
        playoff_rank = getattr(pick.player.team, playoff_pos)  if pick.player.team and pick.player.position in ('QB', 'WR', 'RB', 'TE', 'DEF') else 0
        playoff_rank = 0 if not playoff_rank else playoff_rank
        pick.playoff_rank = team_rank_to_quint(playoff_rank)

        wscore = pick.player.team.playoff_weather_score if pick.player.team else 0
        wscore = 0 if not wscore else wscore
        weather_rank = weather_rank_to_quint(wscore)
        pick.weather_rank = weather_rank
        pick.weather_color = STOPLIGHT_COLORS.get(weather_rank, STOPLIGHT_COLORS[100])
        oscore = pick.player.team.oline_ranking if pick.player.team else 0
        pick.oline_rank = oscore
        pick.oline_color = STOPLIGHT_COLORS.get(oscore, STOPLIGHT_COLORS[100])
        pick.skepticism_color = STOPLIGHT_COLORS.get(pick.player.skepticism, STOPLIGHT_COLORS[100]) if pick.player.skepticism else STOPLIGHT_COLORS[100]
        sched_rank = pick.player.team.early_season_schedule if pick.player.team else 0
        pick.schedule_color = STOPLIGHT_COLORS.get(pick.early_season_rank)
        pick.playoff_color = STOPLIGHT_COLORS.get(pick.playoff_rank)
        if pick.player.team:
            offensive_support_rank = pick.player.team.run_ranking if pick.player.position == 'RB' else pick.player.team.pass_ranking if pick.player.position in ('QB', 'WR', 'TE') else 0
            offensive_support_rank = 0 if offensive_support_rank == 0 else 1 if offensive_support_rank <= 5 else 2 if offensive_support_rank <= 12 else 3 if offensive_support_rank <=20 else 4 if offensive_support_rank <= 25 else 5
            pick.offensive_support_rank = offensive_support_rank
            pick.offensive_support_color = STOPLIGHT_COLORS.get(offensive_support_rank)

        if pick.manager:
            draft_dict[pick.manager.id].append(pick)
    
def populate_draft_board(rounds, managers, draft_dict):
    draft_board = []
    for i in range(0, rounds+1):
        round_num = i + 1
        rdict = {round_num: {'active': True if round_num <= 2 else False, 'picks': []}}
        for manager in managers:
            try:
                pick = draft_dict[manager.id][i]
                slot_dict = {'round_num': round_num, 'column_num': manager.position, 'pick': pick}
                rdict[round_num]['picks'].append(slot_dict)
                rdict[round_num]['active'] = True
            except Exception as exc:
                slot_dict = {'round_num': round_num, 'column_num': manager.position, 'pick': None}
                rdict[round_num]['picks'].append(slot_dict)
        draft_board.append(rdict)
    return draft_board

def get_draft_board_objects(draft):
    players = d.Player.objects.filter(year=draft.year)
    managers = d.Manager.objects.filter(draft=draft).order_by('id')
    # picks = d.DraftPick.objects.filter(draft=draft).order_by('-player__projected_price')
    picks_by_adp = d.DraftPick.objects.select_related('player__team', 'draft', 'manager').filter(draft=draft).order_by('-player__projected_price')
    picks_by_time = d.DraftPick.objects.select_related('player__team', 'draft', 'manager').filter(draft=draft)
    picks_by_time = picks_by_time.annotate(draft_time=Case(
        When(drafted=True, then=F('last_update_time')),
        default=None
    )).order_by('draft_time', '-player__projected_price')
    watches = d.WatchPick.objects.select_related('player__team', 'draft', 'manager').filter(draft=draft, watched=True).order_by('-player__projected_price')
    # picks = d.DraftPick.objects.prefetch_related('player', 'draft', 'manager').filter(draft=draft).order_by('-player__projected_price')
    notes = d.YearlyNotes.objects.filter(year=draft.year).first()
    return players, managers, picks_by_adp, picks_by_time, watches, notes

def get_draft_object_lists(rounds, picks_by_adp, watches, players, draft, managers):
    slot_list = [d.POSITIONS[x] for x in range(0, rounds)]
    drafted_players = [pick.player for pick in picks_by_adp]
    watched_players = [watch.player for watch in watches]
    watch_total = 0
    watch_total = sum([player.projected_price for player in watched_players])

    available_players = sorted([player for player in players if player not in drafted_players], key=lambda x: x.projected_price, reverse=True)
    drafter_players = []
    if draft.drafter:
        drafter = managers.get(name=draft.drafter)
        drafter_players = [pick for pick in picks_by_adp if pick.manager == drafter and pick.drafted]
    return slot_list, watched_players, available_players, drafter_players, watch_total

def get_draft_context(
    draft, slot_list, managers, players, adp_rounds, picks_by_adp,
    picks_by_time, available_players, drafter_players, watched_players, 
    watch_total, draft_board, new_projected_team, notes
):
    return {
        "draft": draft,
        "slot_list": slot_list,
        "managers": managers,
        "players": players,
        "adp_rounds": adp_rounds,
        "picks_by_adp": picks_by_adp,
        "picks_by_time": picks_by_time,
        "available_players": available_players,
        "drafter_players": drafter_players,
        "watched_players": watched_players,
        "watch_total": watch_total,
        "team_draft_slots": d.POSITIONS,
        "draftboard": draft_board,
        "new_projected_team": new_projected_team,
        "note": notes
    }
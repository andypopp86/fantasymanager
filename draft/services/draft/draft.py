from django.http import Http404

from core.services.base import BaseService
from django.db.models import F, Case, When, DecimalField
from django.db.models.functions import  Coalesce

from draft import models as d 
from draft.utils import (
    weather_rank_to_quint, team_rank_to_quint,
    STOPLIGHT_COLORS
)

class DraftManagersReadService(BaseService):

    def get(
        self,
        draft_id
    ):
        managers = d.Manager.objects.filter(draft_id=draft_id).order_by("position")
        if not managers:
            raise Http404
        return managers
    
class DraftBoardReadService(BaseService):
    def get(self, draft_id):
        draft = d.Draft.objects.filter(id=draft_id).first()
        if not draft:
            raise Http404
        return draft.draft_rounds()
        

class DraftReadService(BaseService):

    def get_draft_detail(
        self,
        draft_id
    ):
        draft = d.Draft.objects.filter(id=draft_id).first()
        if not draft:
            raise Http404
        return draft
    
    def get_drafts(self):
        drafts = d.Draft.objects.all()
        return drafts
    
    def get_picks(self, draft_id):
        picks = d.DraftPick.objects.filter(draft_id=draft_id).order_by("manager__name", "-price")
        return picks
    
    def get_available_players(self, draft_id):
        return d.DraftPick.objects.filter(draft_id=draft_id, drafted=False).order_by("-player__projected_price")
    

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

def picks_data_add_budgeted(pick, budget_dict):
    pick.budgeted = True if budget_dict.get(pick.player.id, None) else False

def picks_data_add_early_season_rank(pick):
    early_season_pos =  f'early_season_{pick.player.position.lower()}'
    early_season_rank = getattr(pick.player.team, early_season_pos)  if pick.player.team and pick.player.position in ('QB', 'WR', 'RB', 'TE', 'DEF') else 0
    early_season_rank = 0 if not early_season_rank else early_season_rank
    pick.early_season_rank = team_rank_to_quint(early_season_rank)
    pick.schedule_color = STOPLIGHT_COLORS.get(pick.early_season_rank)
    
def picks_data_add_playoff_rank(pick):
    playoff_pos =  f'playoff_{pick.player.position.lower()}'
    playoff_rank = getattr(pick.player.team, playoff_pos)  if pick.player.team and pick.player.position in ('QB', 'WR', 'RB', 'TE', 'DEF') else 0
    playoff_rank = 0 if not playoff_rank else playoff_rank
    pick.playoff_rank = team_rank_to_quint(playoff_rank)
    pick.playoff_color = STOPLIGHT_COLORS.get(pick.playoff_rank)
    
def picks_data_add_weather_rank(pick):
    wscore = pick.player.team.playoff_weather_score if pick.player.team else 0
    wscore = 0 if not wscore else wscore
    weather_rank = weather_rank_to_quint(wscore)
    pick.weather_rank = weather_rank
    pick.weather_color = STOPLIGHT_COLORS.get(weather_rank, STOPLIGHT_COLORS[100])

def picks_data_add_oline_rank(pick):
    oscore = pick.player.team.oline_ranking if pick.player.team else 0
    pick.oline_rank = oscore
    pick.oline_color = STOPLIGHT_COLORS.get(oscore, STOPLIGHT_COLORS[100])

def picks_data_add_skepticism_rank(pick):
    pick.skepticism_color = STOPLIGHT_COLORS.get(pick.player.skepticism, STOPLIGHT_COLORS[100]) if pick.player.skepticism else STOPLIGHT_COLORS[100]

def picks_data_add_offensive_support_rank(pick):
    if pick.player.team:
        offensive_support_rank = pick.player.team.run_ranking if pick.player.position == 'RB' else pick.player.team.pass_ranking if pick.player.position in ('QB', 'WR', 'TE') else 0
        offensive_support_rank = 0 if offensive_support_rank == 0 else 1 if offensive_support_rank <= 5 else 2 if offensive_support_rank <= 12 else 3 if offensive_support_rank <=20 else 4 if offensive_support_rank <= 25 else 5
        pick.offensive_support_rank = offensive_support_rank
        pick.offensive_support_color = STOPLIGHT_COLORS.get(offensive_support_rank)
    
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

def get_draft_object_lists(picks_by_adp, watches, players, draft, managers):
    drafted_players = [pick.player for pick in picks_by_adp]
    watched_players = [watch.player for watch in watches]
    watch_total = 0
    watch_total = sum([player.projected_price for player in watched_players])

    available_players = sorted([player for player in players if player not in drafted_players], key=lambda x: x.projected_price, reverse=True)
    drafter_players = []
    if draft.drafter:
        drafter = managers.get(name=draft.drafter)
        drafter_players = [pick for pick in picks_by_adp if pick.manager == drafter and pick.drafted]
    return watched_players, available_players, drafter_players, watch_total

def get_draft_context(
    draft, managers, players, adp_rounds, picks_by_adp,
    picks_by_time, available_players, drafter_players, watched_players, 
    watch_total, draft_board, new_projected_team, notes
):
    return {
        "draft": draft,
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

def create_projected_player_list(player_to_add, drafted_players, budgeted_players):
    player_ids_selected = set()
    projected_players = [{
        'id': player_to_add.id,
        'player': player_to_add,
        'name': player_to_add.name,
        'position': player_to_add.position,
        'source': 'budgeted',
        'price': float(player_to_add.override_price or player_to_add.projected_price)
        }
        ] if player_to_add else []
    for dplayer in drafted_players:
        if dplayer.player.id in player_ids_selected:
            continue
        player_ids_selected.add(dplayer.player.id)
        projected_players.append({'id': dplayer.player.id, 'player': dplayer, 'name': dplayer.player.name, 'position': dplayer.player.position, 'source': 'drafted', 'price': float(dplayer.price)})
    for bplayer in budgeted_players:
        if bplayer.player.id in player_ids_selected:
            continue
        player_ids_selected.add(bplayer.player.id)
        projected_players.append({'id': bplayer.player.id, 'player': bplayer, 'name': bplayer.player.name, 'position': bplayer.player.position, 'source': 'budgeted', 'price': float(bplayer.player.override_price or bplayer.player.projected_price)})
    sorted_proj_players = sorted(projected_players, key=lambda x: x['price'], reverse=True)
    return sorted_proj_players

def get_projected_players(owner):
    drafted_players = d.DraftPick.objects.filter(manager=owner, drafted=True).select_related("player")
    drafted_players = drafted_players.annotate(pos_order=Case(
        When(player__position='QB', then=1),
        When(player__position='RB', then=2),
        When(player__position='WR', then=3),
        When(player__position='TE', then=4),
        When(player__position='DEF', then=5),
        default=10
    ))
    drafted_players = drafted_players.annotate(pick_price=Coalesce('price', 'player__projected_price', output_field=DecimalField()))
    drafted_players = drafted_players.order_by('pos_order', '-pick_price')
    budgeted_players = d.BudgetPlayer.objects.filter(manager=owner, status__in=('budgeted', 'drafted')).select_related("player")
    budgeted_players = budgeted_players.annotate(pos_order=Case(
        When(player__position='QB', then=1),
        When(player__position='RB', then=2),
        When(player__position='WR', then=3),
        When(player__position='TE', then=4),
        When(player__position='DEF', then=5),
        default=10
    ))
    budgeted_players = budgeted_players.order_by('-player__projected_price')
    return drafted_players, budgeted_players


def assign_to_projected_team(projected_team, pdict, slots_to_check):
    for pos in slots_to_check:
        if projected_team[pos] is None:
            projected_team[pos] = {'id': pdict['id'], 'player': pdict['name'], 'price': pdict['price'], 'source': pdict['source'], 'position': pdict['position']}
            break
        # else:

def assemble_projected_team(sorted_proj_players):
    projected_team = {pos: None for pos in d.POSITIONS_MAP.keys()}
    for pdict in sorted_proj_players:
        if pdict['position'] == 'QB' and projected_team['QB1'] is None:
            assign_to_projected_team(projected_team, pdict, ('QB1', 'BENCH1', 'BENCH2', 'BENCH3', 'BENCH4', 'BENCH5', 'BENCH6', 'BENCH7'))
        elif pdict['position'] == 'RB':
            assign_to_projected_team(projected_team, pdict, ('RB1', 'RB2', 'FLEX1', 'FLEX2', 'BENCH1', 'BENCH2', 'BENCH3', 'BENCH4', 'BENCH5', 'BENCH6', 'BENCH7'))
        elif pdict['position'] == 'WR':
            assign_to_projected_team(projected_team, pdict, ('WR1', 'WR2', 'FLEX1', 'FLEX2', 'BENCH1', 'BENCH2', 'BENCH3', 'BENCH4', 'BENCH5', 'BENCH6', 'BENCH7'))
        elif pdict['position'] == 'TE':
            assign_to_projected_team(projected_team, pdict, ('TE1', 'FLEX1', 'FLEX2', 'BENCH1', 'BENCH2', 'BENCH3', 'BENCH4', 'BENCH5', 'BENCH6', 'BENCH7'))
        elif pdict['position'] == 'DEF':
            assign_to_projected_team(projected_team, pdict, ('DEF1', 'FLEX1', 'FLEX2', 'BENCH1', 'BENCH2', 'BENCH3', 'BENCH4', 'BENCH5', 'BENCH6', 'BENCH7'))
    return projected_team

def get_new_projected_team(owner, player_to_add=None):
    # if already budgeted/drafted, do nothing
    if player_to_add:
        if d.BudgetPlayer.objects.filter(manager=owner, status__in=('budgeted', 'drafted'), player=player_to_add).first():
            return
        if d.DraftPick.objects.filter(manager=owner, drafted=True, player=player_to_add).first():
            return
    # get all drafted/budgeted players to arrange in positional order, price descending
    drafted_players, budgeted_players = get_projected_players(owner)
    sorted_proj_players = create_projected_player_list(player_to_add, drafted_players, budgeted_players)
    projected_team = assemble_projected_team(sorted_proj_players)
    return projected_team

def refresh_player_budget(new_projected_team, draft_id, manager_id):
    players_to_delete = d.BudgetPlayer.objects.filter(draft_id=draft_id, manager_id=manager_id)
    players_to_delete.delete()
    for slot, pdict in new_projected_team.items():
        if pdict:
            default_data = {'price': pdict['price'], 'status': pdict['source'], 'position': slot}
            budget_player, created = d.BudgetPlayer.objects.get_or_create(
            draft_id = draft_id
            ,player_id=pdict['id']
            ,manager_id=manager_id
            ,defaults=default_data
            )
            if not created:
                budget_player.price = pdict['price']
                budget_player.position = slot
                budget_player.status = 'budgeted'
                budget_player.save(update_fields=['price', 'position', 'status'])

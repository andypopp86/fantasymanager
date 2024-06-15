import json
import html

from decimal import Decimal

from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.shortcuts import render, reverse
from django.db.models import F
from django.utils import timezone
from django.db.models.expressions import Window
from django.db.models.functions import RowNumber


from draft import models as d 
from draft.services.draft.draft import (
    init_managers, init_adp_rounds,
    get_draft_board_objects, populate_draft_board, get_draft_object_lists, get_draft_context,
    get_new_projected_team,
    picks_data_add_budgeted,
    picks_data_add_early_season_rank,
    picks_data_add_playoff_rank,
    picks_data_add_weather_rank,
    picks_data_add_oline_rank,
    picks_data_add_skepticism_rank,
    picks_data_add_offensive_support_rank,
    refresh_player_budget,
)

def get_draft_board_data(request, draft_id):
    draft = d.Draft.objects.get(id=draft_id)
    player_pool = d.Player.objects.filter(year=draft.year)
    player_pool = player_pool.annotate(draft_id=F('drafted_players__draft__id'))
    player_pool = player_pool.annotate(manager=F('drafted_players__manager__name'))
    player_pool = player_pool.annotate(price=F('drafted_players__price'))
    player_pool = player_pool.annotate(draft_order=Window(
        expression=RowNumber(),
        order_by=('drafted_players__last_update_time', 'id')
    )).order_by('drafted_players__last_update_time', 'id')

    draft_pick_dict = {}
    for player in player_pool:
        draft_pick_dict[player.id] = {
            "draft_pick_id": True
            ,"draft_id": player.draft_id
            ,"player_id": player.player_id
            ,"name": player.name
            ,"position": player.position
            ,"adp_formatted": str(player.adp_formatted)
            ,"drafted": True
            ,"draft_order": str(player.draft_order)
            ,"manager": str(player.manager) if player.manager else None
            ,"price": str(player.price) if player.price else None
        }

    return draft_pick_dict

def get_draft_board_json(request, draft_id):
    draft_pick_dict = get_draft_board_data(request, draft_id)
    draft = d.Draft.objects.get(id=draft_id)
    projected_team_string = draft.projected_draft
    position_option_slots = draft.saved_slots
    drafter = d.Manager.objects.get(draft=draft, drafter=True)
    new_projected_team = get_new_projected_team(owner=drafter)
    data = {
        'status': 'success!',
        'data': {
            'draft_id': draft.id,
            'drafter_id': drafter.id,
            'projected_team_string': projected_team_string,
            'position_option_slots': position_option_slots,
            'draft_pick_dict': draft_pick_dict,
        },
        'new_projected_team': new_projected_team

    }
    draft_pick_json = json.dumps(data)
    return JsonResponse(draft_pick_json, safe=False)



def list(request):
    drafts = d.Draft.objects.all()
    var_dict = {
        "drafts": drafts
    }
    return render(request, 'draft/list.html', var_dict)

def create_draft(request):
    if request.method == 'POST':
        draft_name = html.unescape(request.POST['draft_name'])
        draft_year = html.unescape(request.POST['draft_year'])
        managers = html.unescape(request.POST['draft_managers'])
        managers_to_create = [manager for manager in managers.splitlines() if len(manager.strip()) > 0 ]
        for manager in managers.splitlines():
            if '*' in manager:
                drafter = manager.replace('*', '')
        
        draft = d.Draft.objects.create(draft_name=draft_name, year=draft_year, drafter=drafter)
        draft.save()
        draft_managers = []
        for i, new_manager in enumerate(managers_to_create, start=1):
            manager = d.Manager.objects.create(
                draft=draft
                ,name=new_manager.replace('*', '')
                ,drafter=('*' in new_manager)
                ,position=i
            )
            manager.save()
            draft_managers.append(manager)
        players = d.Player.objects.filter(year=draft.year)
        draft_picks = [d.DraftPick(draft=draft, player=player) for player in players]
        d.DraftPick.objects.bulk_create(draft_picks)
        var_dict = {
            "draft_id": draft.id,
            }
        return HttpResponseRedirect(reverse('draft:board', kwargs=var_dict))
    else:
        return render(request, 'draft/create.html')

def start_draft(request):
    draft_id = d.Draft.objects.all().count() + 1
    draft_name = "new draft%s" % draft_id
    draft = d.Draft.objects.create(draft_name=draft_name)
    var_dict = {"draft_id": draft.id}
    response = HttpResponseRedirect(reverse('draft:board', kwargs=var_dict))
    return response

def draft_board(request, draft_id):
    draft = d.Draft.objects.filter(id=draft_id).first()
    drafter = None
    teams = 10
    rounds = 16
    draft.add_missing_players()
    players, managers, picks_by_adp, picks_by_time, watches, notes = get_draft_board_objects(draft)
    adp_rounds = init_adp_rounds(players, teams)
    draft_dict = {}
    drafter = init_managers(managers, draft_dict)

    budgeted_players = draft.budgeted_players.select_related("player").filter(status__in=('drafted', 'budgeted'))
    budget_dict = {bp.player.id: bp for bp in budgeted_players}
    for pick in picks_by_adp:
        if pick.manager:
            draft_dict[pick.manager.id].append(pick)
        picks_data_add_budgeted(pick, budget_dict)
        picks_data_add_early_season_rank(pick)
        picks_data_add_playoff_rank(pick)
        picks_data_add_weather_rank(pick)
        picks_data_add_oline_rank(pick)
        picks_data_add_skepticism_rank(pick)
        picks_data_add_offensive_support_rank(pick)
    draft_board = populate_draft_board(rounds, managers, draft_dict)
    new_projected_team = get_new_projected_team(owner=drafter)
    watched_players, available_players, drafter_players, watch_total = get_draft_object_lists(picks_by_adp, watches, players, draft, managers)
    context = get_draft_context(
        draft, managers, players, adp_rounds, picks_by_adp,
        picks_by_time, available_players, drafter_players, watched_players, 
        watch_total, draft_board, new_projected_team, notes
    )
    return render(request, 'draft/draftboard.html', context)

def draft_player(request, draft_id, player_id):
    draft = d.Draft.objects.get(id=draft_id)
    manager_id = request.POST.get('manager_id', None)
    price = float(request.POST.get('price', 0))
    position = request.POST.get('position', 'unknown')
    position_limit = getattr(draft, f"limit_{position.lower()}")
    messages = []
    now = timezone.now()
    data = {
        'draft_id': draft_id,
        'player_id': player_id,
        'was_drafter': False
    }
    manager = d.Manager.objects.get(id=manager_id)
    drafter = draft.managers.filter(drafter=True).first()
    current_projected_team = get_new_projected_team(drafter)
    player_assigned_slot = None
    for team_slot, player in current_projected_team.items():
        if position in ('QB') and not player and (team_slot.startswith('QB') or team_slot.startswith('BENCH')):
            player_assigned_slot = str(team_slot)
            break
        elif position in ('RB', 'WR', 'TE') and not player and \
            (team_slot.startswith('RB') or team_slot.startswith('FLEX') or team_slot.startswith('BENCH')):
            player_assigned_slot = str(team_slot)
            break
        elif position in ('DEF') and not player and \
            (team_slot.startswith('RB') or team_slot.startswith('BENCH')):
            player_assigned_slot = str(team_slot)
            break

    # team_slots, open_position_slots, filled_slot = manager.current_team
    # next_slot = get_next_open_slot(position, team_slots)
    new_projected_team = None
    # if not player_assigned_slot:
    #     data['status'] = 'error'
    #     data['error'] = 'Can not draft this position'
    # elif manager.budget < price:
    #     data['status'] = 'error'
    #     data['error'] = 'Not enough money!'
    # else:
    d.DraftPick.objects.filter(draft_id=draft_id, player_id=player_id, drafted=False) \
        .update(drafted=True, manager_id=manager_id, price=price, last_update_time=now, position_slot=player_assigned_slot)
    update_budget = False
    if manager.drafter:
        # you drafted a player you budgeted - update that players status
        update_budget = True
        default_data = {'price': price, 'position': player_assigned_slot, 'status': 'drafted'}
        budget_player, created = d.BudgetPlayer.objects.get_or_create(
        draft_id = draft_id
        ,player_id=player_id
        ,manager_id= manager_id
        ,defaults=default_data
        )
        budget_player.status = 'drafted'
        budget_player.save(update_fields=['status'])
        data['was_drafter'] = True
    else:
        # someone else drafted your player - remove him from your budget
        budget_player = d.BudgetPlayer.objects.filter(
            player_id=player_id,
            draft_id=draft_id,
            manager_id=drafter.id,
            status__in=('drafted', 'budgeted'))
        if budget_player:
            update_budget = True
            budget_player.update(status='none')
    # your budgeted player was impacted, update team
    if update_budget:
        new_projected_team = get_new_projected_team(drafter)
        if new_projected_team:
            refresh_player_budget(new_projected_team, draft_id, manager_id)
    manager.refresh_budget()
    manager_player_ct = manager.manager_players.filter(drafted=True).count()
    manager_pos_ct = manager.manager_players.filter(drafted=True, player__position=position).count()
    if manager_pos_ct >= position_limit:
        messages.append(f'{manager.name} has reached position ({position}) limit')
    data['status'] = 'drafted'
    data['updated_budget'] = manager.budget
    data['mgr_player_ct'] = manager_player_ct
    data['mgr_position'] = manager.position
    data['new_projected_team'] = new_projected_team
    data['messages'] = messages
    response = JsonResponse(json.dumps(data), safe=False)
    return response

def undraft_player(request, draft_id, player_id):
    update_projected_team = False
    draft = d.Draft.objects.get(id=draft_id)
    drafter = draft.managers.filter(drafter=True).first()
    pick = d.DraftPick.objects.filter(draft_id=draft_id, player_id=player_id, drafted=True).first()
    if pick:
        if pick.manager == drafter:
            update_projected_team = True
        price = int(pick.price)
        manager_id = int(pick.manager.id)
        position = str(pick.player.position)

        pick.drafted=False
        pick.manager=None
        pick.price=None
        pick.save()

    budget_player = d.BudgetPlayer.objects.filter(draft_id=draft_id, player_id=player_id, status='drafted').first()
    if budget_player:
        budget_player.status='none'
        budget_player.save()
        if budget_player.manager == drafter:
            update_projected_team = True
    new_projected_team = None
    if update_projected_team:
        new_projected_team = get_new_projected_team(drafter)
        if new_projected_team:
            refresh_player_budget(new_projected_team, draft_id, manager_id)

    manager = d.Manager.objects.get(id=manager_id)
    manager.refresh_budget()
    data = {
        'draft_id': draft_id,
        'player_id': player_id,
        'manager_id': manager.id,
        'undrafted': True,
        'updated_budget': manager.budget,
        'position': position,
        'new_projected_team': new_projected_team
    }

    response = JsonResponse(json.dumps(data), safe=False)
    return response

def unbudget_player(request, draft_id, player_id):
    d.BudgetPlayer.objects.filter(draft_id=draft_id, player_id=player_id, status='budgeted').update(status='none')
    data = {
        'status': 'unbudgeted'
    }
    response = JsonResponse(json.dumps(data), safe=False)
    return response

def draft_player2(request, draft_id, player_id):
    save_draft = False
    draft = d.Draft.objects.get(id=draft_id)
    manager_id = request.POST['manager_id']
    price = request.POST['price']
    drafter = d.Manager.objects.get(draft=draft, drafter=True)
    try:
        drafted_player = d.DraftPick.objects.get(draft=draft, player__id=player_id)
        drafted_player.manager = d.Manager.objects.get(id=manager_id)
        drafted_player.price = price 
        drafted_player.drafted = True
        drafted_player.watched = False
        drafted_player.save()
    except:
        drafted_player = d.DraftPick.objects.create(
        draft = draft
        ,player = d.Player.objects.get(id=player_id)
        ,manager = d.Manager.objects.get(id=manager_id)
        ,price=price
        ,drafted=True
        ,watched=False
        )
    manager = d.Manager.objects.get(id=manager_id)
    manager.budget -= int(price)
    manager.save()
    managers_dict = {}
    for manager in d.Manager.objects.filter(draft=draft):
        managers_dict[manager.id] = {
            "name": manager.name,
            "budget": str(manager.budget)
        }

    teamPartsString = request.POST.get('teamPartsString')
    if teamPartsString:
        draft.projected_draft = teamPartsString
        save_draft = True

    draft_position_options = draft.saved_slots
    recreated_position_options_list = []
    for position_options in draft_position_options.split('|'):
        if not drafted_player.player.name in position_options:
            recreated_position_options_list.append(position_options)
        else:
            recreated_slot_list = []
            save_draft = True
            for i, player in enumerate(position_options.split('~')):
                if player != drafted_player.player.name:
                    recreated_slot_list.append(player)
            recreated_position_options_list.append('~'.join(recreated_slot_list))

    draft.saved_slots = '|'.join(recreated_position_options_list)
    if save_draft:
        draft.save()

    draft_pick_dict = get_draft_board_data(request, draft_id)
    data = {
        'status': 'success!',
        'data': {
            'drafter_id': drafter.id,
            'draft_pick_dict': draft_pick_dict,
            'managers_dict': managers_dict
        }
    }
    response = json.dumps(data)
    return HttpResponse(response)


def undraft_player2(request, draft_id, player_id):
    draft = d.Draft.objects.get(id=draft_id)
    drafter = d.Manager.objects.get(draft=draft, drafter=True)
    drafted_player = d.DraftPick.objects.get(
        draft = draft
        ,player = d.Player.objects.get(id=player_id)
    )
    drafted_player.drafted = False
    drafted_player.save() 

    if drafted_player.manager == drafter:
        new_projected_budget = []
        projected_draft = draft.projected_draft
        projected_list = projected_draft.split('|')
        for slot in projected_list:
            parts = slot.split('~')
            if parts[0] == drafted_player.player.name:
                parts[0] = 'Unassigned'
                parts[2] = ''
                parts[3] = ''
            new_projected_budget.append(slot)
    
    manager = drafted_player.manager
    manager.budget += int(drafted_player.price)
    manager.save()
    managers_dict = {}
    for manager in d.Manager.objects.filter(draft=draft):
        managers_dict[manager.id] = {
            "name": manager.name,
            "budget": str(manager.budget)
        }

    teamPartsString = request.POST.get('teamPartsString')
    if teamPartsString:
        draft.projected_draft = teamPartsString
        draft.save()

    draft_pick_dict = get_draft_board_data(request, draft_id)
    data = {
        'status': 'success!',
        'data': {
            'drafter_id': drafter.id,
            'draft_pick_dict': draft_pick_dict,
            'managers_dict': managers_dict
        }
    }
    response = json.dumps(data)
    return HttpResponse(response)

def watch_player(request, draft_id, player_id):
    draft = d.Draft.objects.get(id=draft_id)
    manager_id = request.POST.get('manager_id', None)
    watch_player, created = d.WatchPick.objects.get_or_create(
        draft = draft
        ,player = d.Player.objects.get(id=player_id)
        ,manager= d.Manager.objects.get(id=manager_id)
        ,defaults={'watched': True}
    )
    if not created:
        watch_player.watched = True
        watch_player.save(update_fields=['watched'])
    data = {
        'draft_id': draft_id,
        'player_id': player_id,
        'status': 'watched'
    }
    response = JsonResponse(json.dumps(data), safe=False)
    return response

def unwatch_player(request, draft_id, player_id):
    manager_id = request.POST.get('manager_id', None)
    watch_player, created = d.WatchPick.objects.get_or_create(draft_id=draft_id ,player_id=player_id, manager_id=manager_id, defaults={'watched', False})
    if watch_player.watched:
        watch_player.watched = False
        watch_player.save(update_fields=['watched'])
    data = {
            'draft_id': draft_id,
            'player_id': player_id,
            'status': 'unwatched'
        }
    response = JsonResponse(json.dumps(data), safe=False)
    return response

def save_projected_team(request, draft_id):
    if 'teamPartsString' in request.POST:
        teamPartsString = request.POST['teamPartsString']
        draft = d.Draft.objects.get(id=draft_id)
        draft.projected_draft = teamPartsString
        draft.save()
    return draft_board(request, draft_id=draft_id)

def save_position_slots(request, draft_id):
    draft = d.Draft.objects.get(id=draft_id)
    slot_strings = []
    for i in range(16):
        post_key = 'slot_lists[%s][]' % i
        try:
            post_data = request.POST.getlist(post_key)
        except:
            post_data = None
        if post_data:
            slot_strings.append('~'.join(post_data))
        else:
            slot_strings.append('EMPTY')
    full_slot_string = '|'.join(slot_strings)
    draft.saved_slots = full_slot_string
    draft.save()
    return draft_board(request, draft_id=draft_id)
    # draft_pick_dict = get_draft_board_data(request, draft_id)
    # data = {
    #     'status': 'success!',
    #     'data': {
    #         'draft_pick_dict': draft_pick_dict,
    #         # 'managers_dict': managers_dict
    #     }
    # }
    # response = json.dumps(data)
    # return HttpResponse(response)

def price_board(request, draft_id, rounds):
    draft = d.Draft.objects.get(id=draft_id)
    owner_ct = draft.managers.all().count()
    players = d.Player.objects.all().order_by('-projected_price')
    player_prices = [player.projected_price for player in players]
    player_projected_price_dict = { player.name: player.projected_price for player in players }
    prices_by_round = []
    round_ct = 0
    i = 0

    while round_ct < rounds:
        pick_prices = []
        pick_ct = 0
        while pick_ct < owner_ct:
            if i >= len(player_prices):
                break
            try:
                pick_prices.append({"projected_price": player_prices[i], "actual_price": 0, "selected": False})
                i += 1
            except:
                pass
            pick_ct += 1
        if round_ct % 2 != 0:
            sorted_pick_prices = sorted(pick_prices, key=lambda x: x['projected_price'])
            prices_by_round.append(sorted_pick_prices)
        else:
            prices_by_round.append(pick_prices)
        round_ct += 1
    projections_selected = 0
    if True:
        player_projections = projected_draft_to_list(draft.projected_draft)
        player_actual_dict = {}
        for pproj in player_projections:
            player_actual_dict[pproj[0]] = {
                "player": pproj[0],
                "position": pproj[1],
                "actual_price": pproj[2],
                "projected_price": player_projected_price_dict[pproj[0]],
                "player_id": pproj[3],
            }
    else:
        player_projections = []
    for player, player_dict in player_actual_dict.items():
        projection_marked = False
        if projections_selected >= 16 or projection_marked:
            break
        for round in prices_by_round:
            if projections_selected >= 16 or projection_marked:
                break
            for projection in round:
                if projections_selected >= 16 or projection_marked:
                    break
                if not projection['selected'] and int(float(player_dict['projected_price'])) == int(float(projection['projected_price'])):
                    projection['selected'] = True
                    projection_marked = True
                    projections_selected += 1
                    break

    var_dict = {
        "players": players,
        "prices_by_round": prices_by_round
    }
    return render(request, 'draft/priceboard.html', var_dict)

def projected_draft_to_list(projected_draft):
    player_projections = [projection.split('~') for projection in [player for player in projected_draft.split('|')]]
    sorted_players_projections = sorted(player_projections, key=lambda x: float(x[2]), reverse=True)
    return sorted_players_projections

def historical_draft_picks(request):

    picks = d.HistoricalDraftPicks.objects.all().order_by('-year', '-price')
    var_dict = {
        "picks": picks
    }
    return render(request, 'draft/historical_picks.html', var_dict)

def budget_player(request, draft_id, player_id):
    manager_id = request.POST.get('manager_id', None)
    manager = d.Manager.objects.get(id=manager_id)
    draft = d.Draft.objects.get(id=draft_id)
    player = d.Player.objects.get(year=draft.year, id=player_id)
    price = int(float(player.override_price or player.projected_price))
    next_slot = None
    new_projected_team = None
    if price <= manager.budget:
        player = d.Player.objects.get(year=draft.year, id=player_id)
        new_projected_team = get_new_projected_team(manager, player_to_add=player)
        if new_projected_team:
            refresh_player_budget(new_projected_team, draft_id, manager_id)
    data = {
        'draft_id': draft_id,
        'player_id': player_id,
        'price': price,
        'slot': next_slot,
        'new_projected_team': new_projected_team,
        'status': 'budgeted'
    }
    response = JsonResponse(json.dumps(data), safe=False)
    return response

def update_notes(request, draft_id):
    data = {
        'draft_id': draft_id,
        'status': 'failed'
    }
    draft = d.Draft.objects.get(id=draft_id)
    note, was_created = d.YearlyNotes.objects.get_or_create(
        year=draft.year,
        defaults={'notes': request.POST['notes']}
        )
    if not was_created:
        note.notes = request.POST['notes']
        note.save()
    data['status'] = 'updated'
    response = JsonResponse(json.dumps(data), safe=False)
    return response

# def get_next_open_slot(position, team_slots):
#     # need to update this to handle either next draft spot or next budgeted spot
#     next_slot = None
#     for slot, sdict in team_slots.items():
#         if position in slot and sdict['pick'] is None:
#             next_slot = slot
#             break
#         elif position in d.FLEX_POSITIONS and 'FLEX' in slot and sdict['pick'] is None:
#             next_slot = slot
#             break
#         elif 'BENCH' in slot and sdict['pick'] is None:
#             next_slot = slot
#             break
#     return next_slot




def favorite_player(request, draft_id, player_id):
    draft = d.Draft.objects.get(id=draft_id)
    favorite = True if request.POST['action'] == 'favorite' else False
    d.Player.objects.filter(year=draft.year, id=player_id).update(favorite=favorite)
    data = {
        'draft_id': draft_id,
        'player_id': player_id,
        'status': 'favorited' if request.POST['action'] == 'favorite' else 'unfavorited'
    }
    response = JsonResponse(json.dumps(data), safe=False)
    return response

def unfavorite_player(request, draft_id, player_id):
    draft = d.Draft.objects.get(id=draft_id)
    d.Player.objects.filter(year=draft.year, id=player_id).update(favorite=False)
    data = {
        'draft_id': draft_id,
        'player_id': player_id,
        'status': 'unfavorited'
    }
    response = JsonResponse(json.dumps(data), safe=False)
    return response

def skepticism_rating(request, draft_id, player_id):
    rating = request.POST['rating'] or 0
    draft = d.Draft.objects.get(id=draft_id)
    d.Player.objects.filter(year=draft.year, id=player_id).update(skepticism=rating)
    data = {
        'draft_id': draft_id,
        'player_id': player_id,
        'status': 'rated'
    }
    response = JsonResponse(json.dumps(data), safe=False)
    return response

def react_draft_entrypoint(request):
    context = {}
    return render(request, "draft/index.html", context)
import json
import html

from decimal import Decimal

from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.shortcuts import render, reverse
from django.db.models import F, Case, When, DecimalField
from django.utils import timezone
from django.db.models.expressions import Window
from django.db.models.functions import RowNumber, Coalesce


from draft import models as d 

def get_draft_board_data(request, draft_id):
    player_pool = d.Player.objects.filter(drafted_players__draft__id=draft_id)
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
        managers = html.unescape(request.POST['draft_managers'])
        managers_to_create = [manager for manager in managers.splitlines() if len(manager.strip()) > 0 ]
        for manager in managers.splitlines():
            if '*' in manager:
                drafter = manager.replace('*', '')
        
        draft = d.Draft.objects.create(draft_name=draft_name, drafter=drafter)
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
    draft = d.Draft.objects.get(id=draft_id)
    drafter = None
    teams = 10
    rounds = 16
    players = d.Player.objects.filter(year=draft.year)
    managers = d.Manager.objects.filter(draft=draft).order_by('id')
    # picks = d.DraftPick.objects.filter(draft=draft).order_by('-player__projected_price')
    picks_by_adp = d.DraftPick.objects.select_related('player', 'draft', 'manager').filter(draft=draft).order_by('-player__projected_price')
    picks_by_time = d.DraftPick.objects.select_related('player', 'draft', 'manager').filter(draft=draft)
    picks_by_time = picks_by_time.annotate(draft_time=Case(
        When(drafted=True, then=F('last_update_time')),
        default=None
    )).order_by('draft_time', '-player__projected_price')
    watches = d.WatchPick.objects.select_related('player', 'draft', 'manager').filter(draft=draft, watched=True).order_by('-player__projected_price')
    # picks = d.DraftPick.objects.prefetch_related('player', 'draft', 'manager').filter(draft=draft).order_by('-player__projected_price')
    adp_rounds = {}
    for i in range(1, 100):
        adp_rounds[i] = []

    round = 1
    for idx, player in enumerate(players, start=1):
        if idx % teams == 0:
            round += 1
        adp_rounds[round].append(player)

    draft_dict = {}
    # create a list of picks for each manager and name one the drafter while we're at it
    for manager in managers:
        if manager.drafter is True:
            drafter = manager
        draft_dict[manager.id] = []
    # add made picks to the managers draft dict
    for pick in picks_by_adp:
        if pick.manager:
            draft_dict[pick.manager.id].append(pick)
    
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
            except:
                slot_dict = {'round_num': round_num, 'column_num': manager.position, 'pick': None}
                rdict[round_num]['picks'].append(slot_dict)
        draft_board.append(rdict)
    new_projected_team = get_new_projected_team(owner=drafter)

    slot_list = [d.POSITIONS[x] for x in range(0, rounds)]
    drafted_players = [pick.player for pick in picks_by_adp]
    watched_players = [watch.player for watch in watches]
    watch_total = sum([player.projected_price for player in watched_players])
    available_players = sorted([player for player in players if player not in drafted_players], key=lambda x: x.projected_price, reverse=True)
    drafter_players = []
    if draft.drafter:
        drafter = managers.get(name=draft.drafter)
        drafter_players = [pick for pick in picks_by_adp if pick.manager == drafter and pick.drafted]

    team_slots, open_position_slots, filled_slot = drafter.current_team
    budget_players = {player.position: {'pick': player, 'source': 'budgeted'} for player in d.BudgetPlayer.objects
                      .filter(draft=draft, manager=drafter, status__in=('budgeted', 'drafted')).order_by('position')}
    position_budget_slots = {slot: None for idx, slot  in d.POSITIONS}
    for pos_code, pos_name in d.POSITIONS:
        drafted_dict = team_slots.get(pos_name, -1)
        if drafted_dict['pick']:
            drafted_dict['source'] = 'drafted'
            position_budget_slots[pos_name] = drafted_dict
        else:
            budgeted_dict = budget_players.get(pos_name, -1)
            if budgeted_dict != -1:
                position_budget_slots[pos_name] = budgeted_dict

    var_dict = {
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
        "new_projected_team": new_projected_team
    }
    return render(request, 'draft/draftboard.html', var_dict)

def draft_player(request, draft_id, player_id):
    manager_id = request.POST.get('manager_id', None)
    price = float(request.POST.get('price', 0))
    position = request.POST.get('position', 'unknown')
    now = timezone.now()
    data = {
        'draft_id': draft_id,
        'player_id': player_id,
    }
    manager = d.Manager.objects.get(id=manager_id)
    team_slots, open_position_slots, filled_slot = manager.current_team
    next_slot = get_next_open_slot(position, team_slots)
    new_projected_team = None

    if not next_slot:
        data['status'] = 'error'
        data['error'] = 'Can not draft this position'
    elif manager.budget < price:
        data['status'] = 'error'
        data['error'] = 'Not enough money!'
    else:
        d.DraftPick.objects.filter(draft_id=draft_id, player_id=player_id, drafted=False) \
            .update(drafted=True, manager_id=manager_id, price=price, last_update_time=now, position_slot=next_slot)
        if manager.drafter:
            default_data = {'price': price, 'position': next_slot, 'status': 'drafted'}
            budget_player, created = d.BudgetPlayer.objects.get_or_create(
            draft_id = draft_id
            ,player_id=player_id
            ,manager_id= manager_id
            ,defaults=default_data
            )
            budget_player.status = 'drafted'
            budget_player.save(update_fields=['status'])
        else:
            drafter = d.Manager.objects.get(draft_id=draft_id, drafter=True)
            bplayer = d.BudgetPlayer.objects.filter(player_id=player_id, draft_id=draft_id, manager_id=drafter).first()
            if bplayer:
                bplayer.delete()
                new_projected_team = get_new_projected_team(drafter)
                if new_projected_team:
                    refresh_player_budget(new_projected_team, draft_id, manager_id)
        manager.budget -= price
        manager.save(update_fields=['budget'])
        manager_player_ct = manager.manager_players.filter(drafted=True).count()
        data['status'] = 'drafted'
        data['updated_budget'] = manager.budget
        data['mgr_player_ct'] = manager_player_ct
        data['mgr_position'] = manager.position
        data['new_projected_team'] = new_projected_team
    response = JsonResponse(json.dumps(data), safe=False)
    return response

def undraft_player(request, draft_id, player_id):
    pick = d.DraftPick.objects.filter(draft_id=draft_id, player_id=player_id, drafted=True).first()
    price = int(pick.price)
    manager_id = int(pick.manager.id)
    position = str(pick.player.position)

    pick.drafted=False
    pick.manager=None
    pick.price=None
    pick.save()

    manager = d.Manager.objects.get(id=manager_id)
    manager.budget += price
    manager.save(update_fields=['budget'])
    data = {
        'draft_id': draft_id,
        'player_id': player_id,
        'manager_id': manager.id,
        'undrafted': True,
        'updated_budget': manager.budget,
        'position': position
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
        new_projected_team = get_new_projected_team(manager, player)
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

def get_next_open_slot(position, team_slots):
    # need to update this to handle either next draft spot or next budgeted spot
    next_slot = None
    for slot, sdict in team_slots.items():
        if position in slot and sdict['pick'] is None:
            next_slot = slot
            break
        elif position in d.FLEX_POSITIONS and 'FLEX' in slot and sdict['pick'] is None:
            next_slot = slot
            break
        elif 'BENCH' in slot and sdict['pick'] is None:
            next_slot = slot
            break
    return next_slot

def get_new_projected_team(owner, player=None):
    if d.BudgetPlayer.objects.filter(manager=owner, status__in=('budgeted', 'drafted'), player=player).first():
        return
    if d.DraftPick.objects.filter(manager=owner, drafted=True, player=player).first():
        return
    drafted_players = d.DraftPick.objects.filter(manager=owner, drafted=True)
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
    budgeted_players = d.BudgetPlayer.objects.filter(manager=owner, status__in=('budgeted', 'drafted'))
    budgeted_players = budgeted_players.annotate(pos_order=Case(
        When(player__position='QB', then=1),
        When(player__position='RB', then=2),
        When(player__position='WR', then=3),
        When(player__position='TE', then=4),
        When(player__position='DEF', then=5),
        default=10
    ))
    budgeted_players = budgeted_players.order_by('-player__projected_price')
    player_ids_selected = set()
    projected_players = [{
        'id': player.id, 'player': player, 'name': player.name, 'position': player.position, 'source': 'budgeted', 'price': float(player.override_price or player.projected_price)}
        ] if player else []
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


def assign_to_projected_team(projected_team, pdict, slots_to_check):
    for pos in slots_to_check:
        if projected_team[pos] is None:
            projected_team[pos] = {'id': pdict['id'], 'player': pdict['name'], 'price': pdict['price'], 'source': pdict['source'], 'position': pdict['position']}
            break
        # else:

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

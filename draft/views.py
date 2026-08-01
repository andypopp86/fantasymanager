import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render
from django.db.models import F, DecimalField, ExpressionWrapper, Sum

from draft import models as d


def unbudget_player(request, draft_id, player_id):
    d.BudgetPlayer.objects.filter(draft_id=draft_id, player_id=player_id, status='budgeted').update(status='none')
    data = {
        'status': 'unbudgeted'
    }
    response = JsonResponse(json.dumps(data), safe=False)
    return response

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

def historical_draft_picks(request):

    picks = d.HistoricalDraftPicks.objects.all().order_by('-year', '-price')
    var_dict = {
        "picks": picks
    }
    return render(request, 'draft/historical_picks.html', var_dict)

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

def override_prices(request, year):
    if request.method == 'POST':
        player_ids = request.POST.getlist('player_id')
        override_prices = request.POST.getlist('override_price')
        player_prices = dict(zip(player_ids, override_prices))
        for k,v in player_prices.items():
            if v != '':
                price = int(v)
                player = d.Player.objects.get(year=year, id=k)
                player.override_price = price if price >= 0 else None
                player.save()
    players = d.Player.objects.filter(year=year).order_by('-projected_price')
    var_dict = {
        "players": players
    }
    return render(request, 'draft/override_prices.html', var_dict)

def player_stats(request, year, draft_id):
    POINTS_PER_YARD = 0.1
    POINTS_PER_TD = 6
    draft = d.Draft.objects.get(id=draft_id)
    sort_by = request.GET.get('sort_by', 'points_per_dollar')
    field_sort = f'-{sort_by}'
    player_stats = d.PlayerStats.objects.filter(year=year, player__drafted_players__draft__id=draft_id, player__drafted_players__drafted=False)
    player_stats = player_stats.annotate(total_yards=F('rush_yards') + F('receiving_yards'))
    player_stats = player_stats.annotate(points=F("total_yards") * POINTS_PER_YARD + F("tds") * POINTS_PER_TD)
    player_stats = player_stats.annotate(points_per_dollar=ExpressionWrapper(F("points") / F("player__projected_price"), output_field=DecimalField(decimal_places=1)))
    player_stats = player_stats.order_by(field_sort)
    var_dict = {
        "player_stats": player_stats,
        "draft": draft,
    }
    return render(request, 'draft/player_stats.html', var_dict)


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

@login_required
def react_draft_entrypoint(request):
    context = {}
    return render(request, "draft/index.html", context)


def player_running_totals(request, draft_id):
    draft = d.Draft.objects.get(id=draft_id)
    picks = d.DraftPick.objects.filter(draft=draft, drafted=False).order_by('-player__projected_price')
    budget_remaining = d.Manager.objects.filter(draft=draft).aggregate(Sum('budget'))['budget__sum']
    budget_spent = draft.starting_budget * len(d.Manager.objects.filter(draft=draft)) - budget_remaining
    running_total = 0
    drafter = d.Manager.objects.filter(draft=draft, drafter=True).first()
    for pick in picks:
        running_total += pick.player.projected_price
        pick.running_total = running_total
    var_dict = {
        "players": picks,
        "budget_spent": budget_spent,
        "drafter": drafter,
        "budget_remaining": budget_remaining - drafter.budget
    }
    return render(request, 'draft/player_running_totals.html', var_dict)

from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os 
import csv

from django.utils import timezone

from draft import models as d

from django.db.models.expressions import Window
from django.db.models.functions import RowNumber

def update_adp():
    adp_dict = {}
    picks = d.DraftPick.objects.filter(draft__locked=True, drafted=True, price__gt=0)
    picks = picks.annotate(draft_order=Window(
        expression=RowNumber(),
        partition_by=('draft__year', 'player__position'),
        order_by=('draft__year', 'player__position', '-price')
    )).order_by('draft__year', 'player__position', '-price')
    
    for pick in picks:
        # print(pick.draft.year, pick.draft_order, pick.player.name, pick.player.position, pick.price)
        if pick.player.position not in adp_dict:
            adp_dict[pick.player.position] = {}
        if pick.draft_order not in adp_dict[pick.player.position]:
            adp_dict[pick.player.position][pick.draft_order] = []
        adp_dict[pick.player.position][pick.draft_order].append(pick.price)

    position_adps = []
    for pos in adp_dict:
        for order in adp_dict[pos]:
            adp_dict[pos][order] = sum(adp_dict[pos][order])/len(adp_dict[pos][order])
            position_adps.append(d.PositionADP(
                position=pos,
                adp=order,
                average_price=adp_dict[pos][order]
            ))

    d.PositionADP.objects.all().delete()
    d.PositionADP.objects.bulk_create(position_adps)

def update_players():
    current_year = timezone.now().year
    adp_prices = d.PositionADP.objects.all().order_by('position', 'adp')
    players = d.Player.objects.filter(year=current_year).order_by('adp_formatted')
    players = players.annotate(position_adp=Window(
        expression=RowNumber(),
        partition_by=('position', ),
        order_by=('position', 'adp_formatted',)
    )).order_by('position', 'adp_formatted',)
    adp_price_dict = {}
    for adp_price in adp_prices:
        if adp_price.position not in adp_price_dict:
            adp_price_dict[adp_price.position] = {}
        adp_price_dict[adp_price.position][adp_price.adp] = adp_price.average_price

    for player in players:
        adp_price = adp_price_dict[player.position].get(player.position_adp, 0)
        player.position_price = adp_price
        player.save(update_fields=['position_price'])

    # for k, v in adp_price_dict.items():
    #     print(k, v)

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'
    def add_arguments(self, parser):
        parser.add_argument('--update_adp', action='store_true', dest='update_adp', default=False)
        parser.add_argument('--update_players', action='store_true', dest='update_players', default=False)

    def handle(self, *args, **options):
        if options['update_adp']:
            update_adp()
        if options['update_players']:
            update_players()

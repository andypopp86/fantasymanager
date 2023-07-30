from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os 
import json

from django.utils import timezone

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first')

    def handle(self, *args, **options):
        
        this_year = timezone.now().year
        kickers = d.Player.objects.filter(position='PK')
        kickers.delete()
        yearly_prices = {}
        years = d.HistoricalDraftPicks.objects.all().distinct('year')
        for year in years:
            yearly_prices[year.year] = []
        historical_picks = d.HistoricalDraftPicks.objects.all().order_by('year', '-price')
        for pick in historical_picks:
            if pick.player:
                yearly_prices[pick.year].append(pick.price)
        
        loops = 0
        stop_pricing = False
        average_adp_prices = []
        while loops < 300 and not stop_pricing:
            draft_pos_prices = []
            for year in yearly_prices.keys():
                try:
                    draft_pos_prices.append(yearly_prices[year][loops])
                except:
                    pass 
            if len(draft_pos_prices) == 0:
                stop_pricing = True
            else:
                average_adp_prices.append(sum(draft_pos_prices) / len(draft_pos_prices))
            loops += 1

        # for price in average_adp_prices:
        #     print(price)
        
        data_path = os.path.join(os.getcwd(),'data','players.json')
        with open(data_path, 'r') as f:
            data = json.load(f)
            player_ct = 0
            for player_json in data['players']:
                if player_json['position'] != 'PK':
                    try:
                        projected_price = round(average_adp_prices[player_ct],2)
                    except:
                        projected_price = 0.00
                    print('updating player %s (%s) with price %s' % (player_json['name'], player_json['player_id'], projected_price))
                    player, created = d.Player.objects.get_or_create(
                        player_id=player_json['player_id'],
                        year=this_year,
                        defaults={
                            'name': player_json['name'],
                            'position': player_json['position'],
                            'adp_formatted': player_json['adp_formatted'],
                            'projected_price': projected_price
                        }
                    )
                    player.projected_price = projected_price
                    player.save()
                    player_ct += 1

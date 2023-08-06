from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os 
import json

from django.utils import timezone

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first', default=None)

    def handle(self, *args, **options):
        this_year = timezone.now().year
        data_path = os.path.join(os.getcwd(),'data','players.json')
        nfl_team_codes = set()
        with open(data_path, 'r') as f:
            data = json.load(f)
            player_ct = 0
            for player_json in data['players']:
                nfl_team_codes.add(player_json['team'])
        
        for team in nfl_team_codes:
            d.NFLTeam.objects.create(code=team, year=this_year)
                
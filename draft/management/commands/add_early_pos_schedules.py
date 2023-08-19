from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os 
import csv

from django.utils import timezone

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first', default=None)

    def handle(self, *args, **options):
        this_year = timezone.now().year
        filename = f'{str(this_year)}_early_season_pos_schedules.txt'
        data_path = os.path.join(os.getcwd(),'data', filename)
        
        with open(data_path, 'r') as f:
            reader = csv.reader(f, delimiter='\t')
            for idx, row in enumerate(reader):
                print(idx, row)
                if idx <= 1:
                    continue
                team = row[0].upper().strip()
                try:
                    nflteam = d.NFLTeam.objects.get(code=team, year=this_year)
                    nflteam.early_season_qb = row[1]
                    nflteam.early_season_rb = row[2]
                    nflteam.early_season_wr = row[3]
                    nflteam.early_season_te = row[4]
                    nflteam.early_season_def = row[5]
                    nflteam.save()
                    # weather_score = row[4]
                except Exception as e:
                    print(e)
                    print('couldnt get', idx, team, len(team), this_year)

                    break
        
                
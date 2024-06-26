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
        filename = f'{str(this_year)}_defense_rankings.csv'
        data_path = os.path.join(os.getcwd(),'data', filename)
        
        with open(data_path, 'r') as f:
            reader = csv.reader(f, delimiter=',')
            for idx, row in enumerate(reader):
                code = row[0].strip()
                # team = row[0].upper().strip()
                try:
                    nflteam = d.NFLTeam.objects.get(code=code, year=this_year)
                    nflteam.defensive_ranking = idx
                    nflteam.save()
                    # weather_score = row[4]
                except Exception as e:
                    print(e)
                    print('couldnt get', idx, code, len(code), this_year)

                    break
        
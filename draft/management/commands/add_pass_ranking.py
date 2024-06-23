import logging
logger = logging.getLogger(__name__)

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
        filename = f'{str(this_year)}_prev_year_team_passing.csv'
        data_path = os.path.join(os.getcwd(),'data', filename)
        
        with open(data_path, 'r') as f:
            reader = csv.reader(f, delimiter=',')
            for idx, row in enumerate(reader):
                # team = row[0].upper().strip()
                try:
                    code = row[0].strip()
                    rank = int(row[1].strip())
                    short_name = row[2].strip()
                    # pass_att_pg = float(row[3].strip())
                    nflteam = d.NFLTeam.objects.get(code=code, year=this_year)
                    nflteam.short_name = short_name
                    nflteam.pass_ranking = rank
                    nflteam.save()
                    # weather_score = row[4]
                except Exception as e:
                    logger.info(e)
                    logger.info('couldnt get', idx, code, len(code), this_year)

                    break
        
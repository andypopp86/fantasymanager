from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os 
import csv

from django.utils import timezone

from draft import models as d

import logging
logger = logging.getLogger(__name__)

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first', default=None)

    def handle(self, *args, **options):
        this_year = timezone.now().year
        filename = f'{str(this_year)}_strength_of_schedule.txt'
        data_path = os.path.join(os.getcwd(),'data', filename)
        with open(data_path, 'r') as f:
            reader = csv.reader(f, delimiter='\t')
            for idx, row in enumerate(reader):
                if idx < 1:
                    continue
                team = row[0].upper().strip()
                try:
                    nflteam, created = d.NFLTeam.objects.get_or_create(code=team, name=team, year=this_year)
                    nflteam.early_season_qb = row[1]
                    nflteam.early_season_rb = row[2]
                    nflteam.early_season_wr = row[3]
                    nflteam.early_season_te = row[4]
                    nflteam.early_season_def = row[5]
                    nflteam.save()
                    if created:
                        print(f'created {team} {nflteam.early_season_qb} {nflteam.early_season_rb} {nflteam.early_season_wr} {nflteam.early_season_te} {nflteam.early_season_def}')
                    # weather_score = row[4]
                except Exception as e:
                    logger.info(e)
                    logger.info('couldnt get', idx, team, len(team), this_year)

                    break
        
                
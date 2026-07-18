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
        filename = f'{str(this_year)}_playoff_pos_schedules.txt'
        data_path = os.path.join(os.getcwd(),'data', filename)
        
        with open(data_path, 'r') as f:
            reader = csv.reader(f, delimiter='\t')
            for idx, row in enumerate(reader):
                logger.info(idx, row)
                if idx <= 1:
                    continue
                team = row[0].upper().strip()
                try:
                    nflteam = d.NFLTeam.objects.get(code=team, year=this_year)
                    nflteam.playoff_qb = row[1]
                    nflteam.playoff_rb = row[2]
                    nflteam.playoff_wr = row[3]
                    nflteam.playoff_te = row[4]
                    nflteam.playoff_def = row[5]
                    nflteam.save()
                    # weather_score = row[4]
                except Exception as e:
                    logger.info(e)
                    logger.info('couldnt get', idx, team, len(team), this_year)

                    break
        
                
from django.core.management.base import BaseCommand, CommandError

import os 
import json

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first', default=False)
        parser.add_argument('--year', action='store', dest='year', default=None)
        parser.add_argument('--file', action='store', dest='filename')

    def handle(self, *args, **options):
        if options['delete_all_first']:
            if not options['year']:
                raise Exception('Must provide year to delete')
            result = d.HistoricalPlayerStats.objects.filter(year=options['year']).delete()

        if options['filename']:
            data_path = os.path.join(os.getcwd(),'data',options['filename'])
            with open(data_path, 'r') as f:
                data = f.read().splitlines()
                for i, row in enumerate(data):
                    if i > 0:
                        columns = row.split('\t')
                        player_stats = d.HistoricalPlayerStats.objects.create(
                            year=options['year']
                            ,player_name=columns[0]
                            ,rank=i
                            ,fantasy_points=float(columns[2])
                            ,pass_yards=int(columns[5].replace(',', ''))
                            ,pass_tds=int(columns[6])
                            ,rush_att=int(columns[9])
                            ,rush_yards=int(columns[10].replace(',', ''))
                            ,rush_tds=int(columns[11])
                            ,receptions=int(columns[13])
                            ,rec_yards=int(columns[14].replace(',', ''))
                            ,rec_tds=int(columns[15])
                        )
                        player_stats.save()


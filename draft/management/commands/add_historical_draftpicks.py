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
            result = d.HistoricalDraftPicks.objects.filter(year=options['year']).delete()
            print(result)

        if options['filename']:
            data_path = os.path.join(os.getcwd(),'data',options['filename'])
            with open(data_path, 'r') as f:
                data = f.read().splitlines()
                for i, row in enumerate(data):
                    if i > 0:
                        columns = row.split('\t')
                        try:
                            result = columns[6]
                        except:
                            result = None
                        pick = d.HistoricalDraftPicks.objects.create(
                            year=columns[0]
                            ,manager=columns[1].lower()
                            ,draft_position=columns[2]
                            ,position=columns[3]
                            ,player=columns[4]
                            ,price=columns[5] if len(columns[5]) > 0 else 0
                            ,result=result
                        )
                        pick.save()


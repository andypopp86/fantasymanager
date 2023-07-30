from django.core.management.base import BaseCommand, CommandError

import os 
import json
import csv

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--year', action='store', dest='year')

    def handle(self, *args, **options):
        filename = 'draft_%s.csv' % options['year']
        picks = d.DraftPick.objects.filter(draft__year=options['year'])
        cwd = os.getcwd()
        filepath = os.path.join(cwd, 'data', filename)
        with open(filepath, 'w', newline='') as f:
            csvwriter = csv.writer(f, delimiter='\t')
            csvwriter.writerow(['Year', 'Manager', 'DraftPosition', 'Position', 'Player', 'Price'])
            draft_row_data = [[pick.draft.year, pick.manager.name, 1, pick.player.position, pick.player.name, pick.price] for pick in picks]
            
            csvwriter.writerows(draft_row_data)
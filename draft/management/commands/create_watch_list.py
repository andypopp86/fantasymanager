from django.core.management.base import BaseCommand, CommandError

import csv
import os 
import json

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first', default=False)
        parser.add_argument('--draft_id', action='store', dest='draft_id')

    def handle(self, *args, **options):
        draft = d.Draft.objects.get(id=options['draft_id'])
        players = d.Player.objects.all()
        pdict = {player.name:player for player in players}
        data_path = os.path.join(os.getcwd(),'data','watch.txt')
        with open(data_path, 'r') as f:
            csvreader = csv.reader(f, delimiter='\t')
            for line in csvreader:
                pick, created = d.DraftPick.objects.get_or_create(
                    player=pdict[line[0]], 
                    draft=draft,
                    defaults={
                        'watched': True
                    })
                if not created and not pick.drafted and not pick.watched:
                    print('watching player', line[0])
                    pick.watched = True 
                    pick.save()
                    

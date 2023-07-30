from django.core.management.base import BaseCommand, CommandError

import os 
import json

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        pass

    def handle(self, *args, **options):
        with open('player_list_with_nicknames.csv', 'r') as f:
            lines = f.read().splitlines()
            for line in lines:
                columns = line.split('\t')
                try:
                    player = d.Player.objects.get(name=columns[1])
                    player.nickname = columns[0]
                    player.save()
                except Exception as exc:
                    print(exc)
from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os 
import json

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'
    def handle(self, *args, **options):
        
        players = d.Player.objects.all()

        with open('player_list.csv', 'w') as f:
            f.write('player\tnickname\n')
            for player in players:
                f.write('%s\t \n' % (player.name))
        
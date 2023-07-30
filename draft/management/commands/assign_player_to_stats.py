from django.core.management.base import BaseCommand, CommandError

import os 
import json

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        pass

    def handle(self, *args, **options):
        assigned = []
        unassigned = []
        historical_stats = d.HistoricalPlayerStats.objects.filter(player__isnull=True).order_by('-fantasy_points')
        for hs in historical_stats:
            try:
                hs.player = d.Player.objects.get(name__iexact=hs.player_name)
                hs.save()
                assigned.append(hs)
            except Exception as exc:
                unassigned.append(hs)

        with open('assigned_players.txt', 'w') as f:
            for assignee in assigned:
                f.write('%s\t%s\n' % (assignee.year, assignee.player_name))

        with open('unassigned_players.txt', 'w') as f:
            for assignee in unassigned:
                f.write('%s\t%s\n' % (assignee.year, assignee.player_name))



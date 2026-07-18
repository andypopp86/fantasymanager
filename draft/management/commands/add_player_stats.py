import logging
import csv
logger = logging.getLogger(__name__)

from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os 
import json

from django.utils import timezone

from draft import models as d

NAME_CONVERSIONS = {
    "D.K. Metcalf": "DK Metcalf",
    "D.J. Moore": "DJ Moore",
    "Deebo Samuel": "Deebo Samuel",
    "Travis Etienne": "Travis Etienne Jr.",
    "Marquise Brown": "Hollywood Brown",
}

def load_player_stats():
    this_year = timezone.now().year
    data_path = os.path.join(os.getcwd(),'data', f'{this_year}_player_stats.txt')
    with open(data_path, 'r') as f:
        player_ct = 0
        csv_reader = csv.reader(f, delimiter='\t',)
        next(csv_reader)
        for row in csv_reader:
            type = row[0]
            # rank, player_name, age, position, games, games_started, rush_attempts, rush_yards, targets, receptions, receiving_yards, tds, first_downs
            # rank = row[1]
            name = NAME_CONVERSIONS.get(row[2], row[2])
            player = d.Player.objects.filter(name=name, year=this_year).first()
            if player.name == "Christian McCaffrey":
                print(row)
            age = int(row[3])
            pos = row[4]
            games = int(row[5] or 0)
            games_started = int(row[6] or 0)
            rush_attempts = int(row[7] or 0)
            rush_yards = int(row[8] or 0)
            targets = int(row[9] or 0)
            receptions = int(row[10] or 0)
            receiving_yards = int(row[11] or 0)
            tds = int(row[12] or 0)
            first_downs = int(row[13] or 0)

            if player:
                player_stat, created = d.PlayerStats.objects.get_or_create(
                    player=player, 
                    year=this_year, 
                )
                player_stat.age=age
                player_stat.games=games
                player_stat.games_started=games_started
                player_stat.rush_attempts=rush_attempts
                player_stat.rush_yards=rush_yards
                player_stat.targets=targets
                player_stat.receptions=receptions
                player_stat.receiving_yards=receiving_yards
                player_stat.tds=tds
                player_stat.first_downs=first_downs
                player_stat.save()


class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first')

    def handle(self, *args, **options):
        load_player_stats()
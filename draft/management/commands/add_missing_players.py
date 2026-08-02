import csv
import os

from django.core.management.base import BaseCommand
from django.utils import timezone

from draft import models as d

def get_data(year):
    data_path = os.path.join(os.getcwd(), f'{year}_missing_players.csv')
    print(f"Loading missing players from {data_path}")
    players = []
    with open(data_path, 'r') as f:
        csv_reader = csv.reader(f, delimiter=',',)
        for row in csv_reader:
            name = row[0]
            team = row[1]
            position = row[2]
            player_id = row[3]
            players.append({
                'name': name,
                'position': position,
                'team': team,
                'player_id': player_id
            })
    return players

def load_player(player, year):
    team = d.NFLTeam.objects.filter(code=player['team']).first()
    player_obj, was_created = d.Player.objects.get_or_create(
        player_id=player['player_id'],
        name=player['name'],
        position=player['position'],
        team=team,
        year=year,
        adp_formatted="15.1",
        projected_price=1,
    )
    print(f"Loaded player {player_obj.name} ({player_obj.position}) for {year} with ID {player_obj.player_id}. Created: {was_created}")


class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        # parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first')
        pass

    def handle(self, *args, **options):
        this_year = timezone.now().year
        data = get_data(this_year)
        highest_player_id = d.Player.objects.all().order_by('-player_id').first()
        for player in data:
            load_player(player, this_year)
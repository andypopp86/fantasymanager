from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os 
import csv

from django.utils import timezone

from draft import models as d

TEAM_MAP = {
        'ARI': 'Arizona Cardinals',
        'ATL': 'Atlanta Falcons',
        'BAL': 'Baltimore Ravens',
        'BUF': 'Buffalo Bills',
        'CAR': 'Carolina Panthers',
        'CHI': 'Chicago Bears',
        'CIN': 'Cincinnati Bengals',
        'CLE': 'Cleveland Browns',
        'DAL': 'Dallas Cowboys',
        'DEN': 'Denver Broncos',
        'DET': 'Detroit Lions',
        'GB': 'Green Bay Packers',
        'HOU': 'Houston Texans',
        'IND': 'Indianapolis Colts',
        'JAX': 'Jacksonville Jaguars',
        'KC': 'Kansas City Chiefs',
        'LV': 'Las Vegas Raiders',
        'LAC': 'Los Angeles Chargers',
        'LAR': 'Los Angeles Rams',
        'MIA': 'Miami Dolphins',
        'MIN': 'Minnesota Vikings',
        'NE': 'New England Patriots',
        'NO': 'New Orleans Saints',
        'NYG': 'New York Giants',
        'NYJ': 'New York Jets',
        'PHI': 'Philadelphia Eagles',
        'PIT': 'Pittsburgh Steelers',
        'SF': 'San Francisco 49ers',
        'SEA': 'Seattle Seahawks',
        'TB': 'Tampa Bay Buccaneers',
        'TEN': 'Tennessee Titans',
        'WAS': 'Washington Commanders',
}

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first')

    def handle(self, *args, **options):
        this_year = timezone.now().year
        filename = f'{str(this_year)}_schedule.csv'
        data_path = os.path.join(os.getcwd(),'data', filename)
        
        team_name_map = {team.name: team for team in d.NFLTeam.objects.filter(year=this_year)}
        with open(data_path, 'r') as f:
            reader = csv.reader(f, delimiter='\t')
            for idx, row in enumerate(reader):
                if idx == 0:
                    continue
                home = row[3]
                away = row[6]
                d.Matchup.objects.get_or_create(
                    year=this_year, week=int(row[0]), home=team_name_map[home], away=team_name_map[away]
                )

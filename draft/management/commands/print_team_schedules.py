from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os 
import csv

from django.utils import timezone
from django.db.models import Q

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first')

    def handle(self, *args, **options):
        this_year = timezone.now().year
        nfl_teams = d.NFLTeam.objects.filter(year=this_year).order_by('code')
        team_sos = []
        for team in nfl_teams:
            matchups = d.Matchup.objects.filter(
                Q(year=this_year)
                & Q(week__lte=6)
                & (Q(home__code=team.code) | Q(away__code=team.code))
            )
            opponents = []
            rank_vals = []
            for match in matchups:
                if match.home.code == team.code:
                    opponents.append(match.away.code)
                    rank_vals.append(match.away.defensive_ranking / 32)
                else:
                    opponents.append(f'@{match.home.code}')
                    rank_vals.append(match.home.defensive_ranking / 32)
            opp_string = " | ".join(opponents)
            try:
                rank_sum = int(round(sum(rank_vals), 2) * 100)
                team_sos.append((team, rank_sum))
            except:
                print(team, rank_vals, opp_string)
            # matchups = matchups.values_list
            print(f'{team.code}: ({rank_sum}) - ', opp_string)
        
        rank = 1
        for ttup in sorted(team_sos, key=lambda x: x[1], reverse=True):
            team = ttup[0]
            try:
                team.early_season_schedule = rank
                team.save(update_fields=['early_season_schedule'])
                rank += 1
            except Exception as e:
                print(ttup, e)
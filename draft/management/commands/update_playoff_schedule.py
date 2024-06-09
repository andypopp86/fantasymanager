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
        parser.add_argument('--weeks', action='store', type=int, dest='weeks', default=6)

    def handle(self, *args, **options):
        this_year = timezone.now().year
        nfl_teams = d.NFLTeam.objects.filter(year=this_year).order_by('code')
        team_sos = []
        schedule = {}
        rank_vals = []
        total_weeks = options['weeks'] + 1
        for team in nfl_teams:
            schedule[team.code] = {x: 'BYE' for x in range(1, total_weeks)}
            matchups = d.Matchup.objects.filter(
                Q(year=this_year)
                & Q(week__gte=15)
                & Q(week__lte=17)
                & (Q(home__code=team.code) | Q(away__code=team.code))
            )
            opponents = []
            single_team_opps = []
            last_team_code = ""
            
            for match in matchups:
                if team.code != last_team_code:
                    last_team_code = str(team.code)
                    if single_team_opps:
                        single_team_opps = []
                away_symbol = '' if match.home.code != team.code else '@'
                location = match.home.code if match.home.code != team.code else match.away.code
                matchup_symbol = away_symbol + location
                opposing_team = match.home if match.home.code != team.code else match.away
                single_team_opps.append(opposing_team.defensive_ranking)
                # print(single_team_opps)
                if len(single_team_opps) == 3:
                    rank_vals.append((team.code, round(sum(single_team_opps) / len(single_team_opps),1)))
                # print(team, 'vs', opposing_team, opposing_team.defensive_ranking)
                # rank_val = match.home.code if match.home.defensive_ranking == team.code else match.away.defensive_ranking
                # rank_val = rank_val / 32
                # rank_vals.append(rank_val)
                opponents.append(matchup_symbol)
                schedule[team.code][match.week] = matchup_symbol
            opp_string = "\t".join(opponents)
            # try:
            #     rank_sum = int(round(sum(rank_vals), 2) * 100)
            #     team_sos.append((team, rank_sum))
            # except:
            #     print(team, rank_vals, opp_string)
            # matchups = matchups.values_list
            # if team.code != 'FA':
            #     print(f'{team.code}\t{rank_sum}\t{opp_string}')
        
        rank = 1
        for ttup in sorted(rank_vals, key=lambda x: x[1], reverse=True):
            print(rank, ttup)
            team_code = ttup[0]
            try:
                team = d.NFLTeam.objects.get(code=team_code)
                team.playoff_schedule = rank
                team.save(update_fields=['playoff_schedule'])
                rank += 1
            except Exception as e:
                print(ttup, e)

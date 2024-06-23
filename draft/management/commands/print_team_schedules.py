import logging
logger = logging.getLogger(__name__)

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
        total_weeks = options['weeks'] + 1
        for team in nfl_teams:
            schedule[team.code] = {x: 'BYE' for x in range(1, total_weeks)}
            matchups = d.Matchup.objects.filter(
                Q(year=this_year)
                & Q(week__lte=options['weeks'])
                & (Q(home__code=team.code) | Q(away__code=team.code))
            )
            opponents = []
            rank_vals = []
            for match in matchups:
                away_symbol = '' if match.home.code != team.code else '@'
                location = match.home.code if match.home.code != team.code else match.away.code
                matchup_symbol = away_symbol + location
                rank_val = match.home.code if match.home.defensive_ranking == team.code else match.away.defensive_ranking
                rank_val = rank_val / 32
                rank_vals.append(rank_val)
                opponents.append(matchup_symbol)
                schedule[team.code][match.week] = matchup_symbol
            opp_string = "\t".join(opponents)
            try:
                rank_sum = int(round(sum(rank_vals), 2) * 100)
                team_sos.append((team, rank_sum))
            except:
                logger.info(team, rank_vals, opp_string)
            # matchups = matchups.values_list
            # if team.code != 'FA':
            #     logger.info(f'{team.code}\t{rank_sum}\t{opp_string}')
        
        # rank = 1
        # for ttup in sorted(team_sos, key=lambda x: x[1], reverse=True):
        #     team = ttup[0]
        #     try:
        #         team.early_season_schedule = rank
        #         team.save(update_fields=['early_season_schedule'])
        #         rank += 1
        #     except Exception as e:
        #         logger.info(ttup, e)
        
        week_nums = range(1, total_weeks)
        headers = ['Team' ]
        for num in week_nums:
            headers.append(str(num))
        
        logger.info('\t'.join(headers))
        for team_code, matchup_dict in schedule.items():
            # logger.info(team_code, matchup_dict)
            team_matchups = [team_code]
            for i in range(1, total_weeks):
                matchup = matchup_dict.get(i, 'BYE')
                team_matchups.append(matchup)
            logger.info('\t'.join(team_matchups))
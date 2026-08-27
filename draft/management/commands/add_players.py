import dataclasses
import logging
import csv
logger = logging.getLogger(__name__)

from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os
import json
import requests

from django.utils import timezone
from django.db import models

from draft import models as d

def get_data(year, strategy="api"):
    if strategy == "api":
        scoring_type = 'half-ppr'  # standard, full-ppr
        team_ct = 10
        url = f'https://fantasyfootballcalculator.com/api/v1/adp/{scoring_type}?teams={team_ct}&year={year}'
        resp = requests.get(url)
        return resp.json()

    data_path = os.path.join(os.getcwd(), 'data', 'players.json')
    with open(data_path, 'r') as f:
        return json.load(f)


def get_or_create_team(code, year):
    """FFC rows carry a team code; create the year's NFLTeam row on first
    sight so imports never silently link team=None on a fresh DB. The
    year filter matters on the historical DB — an unfiltered lookup can
    return another season's row. Rankings/schedule attrs stay null until
    the add_team_* commands backfill them."""
    if not code:
        return None
    team, _ = d.NFLTeam.objects.get_or_create(code=code, year=year)
    return team


def compute_average_adp_prices():
    """Average historical auction price by overall draft position — the
    basis for projected_price at each ADP rank."""
    yearly_prices = {}
    years = d.HistoricalDraftPicks.objects.all().distinct('year')
    for year in years:
        yearly_prices[year.year] = []
    historical_picks = d.HistoricalDraftPicks.objects.all().order_by('year', '-price')
    for pick in historical_picks:
        if pick.player:
            yearly_prices[pick.year].append(pick.price)

    loops = 0
    stop_pricing = False
    average_adp_prices = []
    while loops < 300 and not stop_pricing:
        draft_pos_prices = []
        for year in yearly_prices.keys():
            try:
                draft_pos_prices.append(yearly_prices[year][loops])
            except:
                pass
        if len(draft_pos_prices) == 0:
            stop_pricing = True
        else:
            average_adp_prices.append(sum(draft_pos_prices) / len(draft_pos_prices))
        loops += 1
    return average_adp_prices


@dataclasses.dataclass
class ImportSummary:
    """What one FFC import actually did.

    `created` carries the Player objects, not a count, because the callers that
    care (the admin refresh flow) need to say WHO arrived — a player new to the
    feed is exactly the player a draft already in flight is missing.
    """
    year: int
    feed_rows: int = 0
    created: list = dataclasses.field(default_factory=list)
    updated: int = 0
    skipped_kickers: int = 0
    deleted_kickers: int = 0
    # False when the DB has no HistoricalDraftPicks: prices are left untouched
    # rather than flattened to the fallback (see below).
    priced: bool = True

    @property
    def created_names(self):
        return sorted(f'{player.name} ({player.position})' for player in self.created)


def load_ffc_json(average_adp_prices, this_year, data):
    # Prices come from historical auction results; without them a refresh
    # would flatten every projected_price to the fallback. Keep existing
    # prices instead (a DB without HistoricalDraftPicks can use
    # add_default_prices for the curve).
    have_price_basis = len(average_adp_prices) > 0
    if not have_price_basis:
        logger.warning(
            'no HistoricalDraftPicks in this DB - leaving projected_price '
            'untouched (run add_default_prices for a fallback curve)')
    summary = ImportSummary(
        year=this_year,
        feed_rows=len(data['players']),
        priced=have_price_basis,
    )
    player_ct = 0
    for player_json in data['players']:
        if player_json['position'] == 'PK':
            # The feed says PK, the model says K; either way this league doesn't
            # draft kickers.
            summary.skipped_kickers += 1
        else:
            try:
                projected_price = round(average_adp_prices[player_ct],2)
            except:
                projected_price = 0.00
            logger.info('updating player %s (%s) with price %s' % (player_json['name'], player_json['player_id'], projected_price))
            nfl_team = get_or_create_team(player_json['team'], this_year)
            player, created = d.Player.objects.get_or_create(
                player_id=player_json['player_id'],
                year=this_year,
                defaults={
                    'name': player_json['name'],
                    'position': player_json['position'],
                    'adp_formatted': player_json['adp_formatted'],
                    'projected_price': projected_price,
                    'team': nfl_team
                }
            )
            if have_price_basis:
                player.projected_price = projected_price
            # FFC's RAW overall average pick, kept alongside the round.pick
            # adp_formatted above so FFC can be toggled against the other
            # sources on equal terms (see draft/services/adp/). Populated here
            # rather than only by `sync_adp --source ffc` so the existing
            # refresh keeps the column current for free. `.get` because the
            # older cached players.json payloads have no 'adp' key.
            if player_json.get('adp') is not None:
                player.adp_ffc = player_json['adp']
            if not created:
                player.team = nfl_team
                # The point of a refresh: ADP moves in the weeks before the
                # draft, and stale ranks would corrupt every ADP-ordered
                # consumer (add_default_prices, UI sorts).
                player.adp_formatted = player_json['adp_formatted']
            player.save()
            if created:
                summary.created.append(player)
            else:
                summary.updated += 1
            player_ct += 1
    return summary


def refresh_players_from_ffc(year=None):
    """The whole FFC refresh, as one call: drop kickers, recompute the price
    basis, pull the feed, upsert. Returns an ImportSummary.

    Extracted so the management commands (`add_players`, `refresh_player_adp`)
    and the /admin refresh action all run the SAME import — there is one place
    this behaviour lives, and the admin is not allowed to grow its own copy.
    """
    year = year or timezone.now().year
    kickers = d.Player.objects.filter(position='PK')
    deleted_kickers = kickers.count()
    kickers.delete()
    average_adp_prices = compute_average_adp_prices()
    summary = load_ffc_json(average_adp_prices, year, get_data(year))
    summary.deleted_kickers = deleted_kickers
    return summary


def load_fantasypros_txt(this_year):
    data_path = os.path.join(os.getcwd(),'data', f'{this_year}_players.txt')
    with open(data_path, 'r') as f:
        player_ct = 0
        csv_reader = csv.reader(f, delimiter='\t',)
        for row in csv_reader:
            player_ct += 1
            if player_ct == 1:
                continue
            rank = row[0]
            name = row[1]
            team_code = row[2]
            posrank = row[3]
            bye = row[4]
            posrankfull = row[5]
            pos = row[6]
            player_id = row[7]
            team = d.NFLTeam.objects.filter(code=team_code, year=this_year).first()
            create_new = False
            try:
                player_id = int(player_id)
            except:
                create_new = True
            try:
                bye = int(bye)
            except:
                bye = None

            created = False
            if create_new:
                max_player_id = d.Player.objects.filter(year=this_year).aggregate(max_id=models.Max('player_id'))['max_id']
                player = d.Player.objects.create(
                    player_id=max_player_id + 1,
                    year=this_year,
                    name=name,
                    position=pos,
                    team=team,
                    adp_formatted=rank,
                    bye_week=bye
                )
            else:
                player, created = d.Player.objects.get_or_create(player_id=player_id, year=this_year, 
                                                    defaults={
                                                        'name': name, 'position': pos, 
                                                        'team': team, "adp_formatted": rank,
                                                        "bye_week": bye
                                                        })
            if not created:
                player.name = name
                player.position = pos
                player.team = team
                player.adp_formatted = rank
                player.bye_week = bye
                player.save()

            if pos not in ('QB', 'RB', 'WR', 'TE', "DEF"):
                continue
            try:
                rank = int(rank)
            except:
                print(f'couldnt convert rank {rank} to int')
                continue
            
            # try:
            #     projected_price = int(round(average_adp_prices[player_ct],0))
            # except:
            #     projected_price = 0.00
            # nfl_team = d.NFLTeam.objects.filter(code=team, year=this_year).first()
            # if not nfl_team:
            #     print(f'couldnt find team {team} in year {this_year}')
            # player, created = d.Player.objects.get_or_create(
            #     player_id=f"{this_year}{rank}",
            #     defaults={
            #         'adp_formatted': rank,
            #         'year': this_year,
            #         'name': name,
            #         'position': pos,
            #     }
            # )
            # if created:
            #     print(f'created player {player.name} ({player.player_id}) - {player.position} - {player.team}')
            # if not player.team:
            #     print(f'updating player {player.name} ({player.player_id}) - {player.position} - {player.team} - {team}')
            # if team and team != "#N/A":
            #     player.team = nfl_team 
            # player.projected_price = projected_price
            # player.save()


class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first')

    def handle(self, *args, **options):
        summary = refresh_players_from_ffc()
        self.stdout.write(
            f'{summary.feed_rows} FFC rows for {summary.year}: '
            f'{len(summary.created)} created, {summary.updated} updated, '
            f'{summary.skipped_kickers} kickers skipped'
        )
        for name in summary.created_names:
            self.stdout.write(f'  created {name}')
        # load_fantasypros_txt(this_year)
import csv
import os

from django.core.management.base import BaseCommand
from django.utils import timezone

from draft import models as d

HEADER = ['player_id', 'year', 'name', 'position', 'target_tier']


def csv_path(year):
    """Repo ROOT, deliberately — not `data/`.

    Tiers are set by hand in /admin on one machine and replayed on another
    (usually the Railway deploy, which can only be reached by shipping the file
    with the build). `data/` is stripped from both the Docker and Railway
    builds, so a file written there never arrives.
    """
    return os.path.join(os.getcwd(), f'{year}_target_tiers.csv')


class Command(BaseCommand):
    help = (
        "Dump this year's Player.target_tier values to <year>_target_tiers.csv "
        "at the repo root, for update_player_target_tiers to replay on another DB."
    )

    def add_arguments(self, parser):
        parser.add_argument('--year', action='store', dest='year', type=int)

    def handle(self, *args, **options):
        year = options['year'] or timezone.now().year
        # Untiered (0) players are simply absent from the file; the importer
        # treats that absence as "clear this player's tier".
        players = list(
            d.Player.objects.filter(year=year, target_tier__gt=0)
            .order_by('target_tier', 'adp_formatted')
        )
        path = csv_path(year)
        with open(path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(HEADER)
            writer.writerows(
                [player.player_id, player.year, player.name, player.position, player.target_tier]
                for player in players
            )

        print(f"Wrote {len(players)} tiered players for {year} to {path}")
        tiers = sorted({player.target_tier for player in players})
        for tier in tiers:
            names = [p.name for p in players if p.target_tier == tier]
            print(f"  tier {tier}: {len(names)} — {', '.join(names)}")

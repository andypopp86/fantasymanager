import csv
from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from draft import models as d
from draft.management.commands.write_target_tiers_to_csv import csv_path


class Command(BaseCommand):
    help = (
        "Apply <year>_target_tiers.csv (written by write_target_tiers_to_csv) to "
        "Player.target_tier. The file is the source of truth: tiered players it "
        "does NOT list are reset to 0, unless --no-clear."
    )

    def add_arguments(self, parser):
        parser.add_argument('--year', action='store', dest='year', type=int)
        parser.add_argument(
            '--no-clear', action='store_true', dest='no_clear',
            help="Leave players missing from the CSV at their current tier "
                 "instead of resetting them to 0.",
        )
        parser.add_argument(
            '--dry-run', action='store_true', dest='dry_run',
            help="Report what would change, then roll back.",
        )

    def handle(self, *args, **options):
        year = options['year'] or timezone.now().year
        path = csv_path(year)
        try:
            with open(path, 'r') as f:
                rows = list(csv.DictReader(f))
        except FileNotFoundError:
            raise CommandError(
                f"No tier file at {path} — run write_target_tiers_to_csv on the "
                f"machine whose /admin has the tiers, and commit the result so it "
                f"ships with the deploy."
            )

        # (player_id, year) is Player's unique_together, so player_id within a
        # year identifies the row on any DB — unlike the pk, which differs
        # between the local, Windows, and hosted copies.
        wanted = {int(row['player_id']): int(row['target_tier']) for row in rows}
        if not wanted:
            raise CommandError(f"{path} lists no tiered players.")

        existing = set(
            d.Player.objects.filter(year=year, player_id__in=list(wanted))
            .values_list('player_id', flat=True)
        )
        missing = sorted(set(wanted) - existing)

        by_tier = defaultdict(list)
        for player_id, tier in wanted.items():
            by_tier[tier].append(player_id)

        with transaction.atomic():
            applied = 0
            for tier, player_ids in sorted(by_tier.items()):
                # .update(), never .save(): Player.save() rewrites
                # projected_price to max(price or 0, 1), so saving here would
                # quietly reprice every player whose price is null.
                applied += d.Player.objects.filter(
                    year=year, player_id__in=player_ids,
                ).update(target_tier=tier)

            cleared = 0
            if not options['no_clear']:
                cleared = d.Player.objects.filter(
                    year=year, target_tier__gt=0,
                ).exclude(player_id__in=list(wanted)).update(target_tier=0)

            if options['dry_run']:
                transaction.set_rollback(True)

        prefix = "[dry run] " if options['dry_run'] else ""
        print(f"{prefix}{year}: tiered {applied} players from {path}")
        for tier, player_ids in sorted(by_tier.items()):
            print(f"{prefix}  tier {tier}: {len(player_ids)} listed")
        print(f"{prefix}cleared {cleared} player(s) not listed in the file"
              + (" (skipped: --no-clear)" if options['no_clear'] else ""))
        if missing:
            print(f"{prefix}WARNING: {len(missing)} player_id(s) in the file have no "
                  f"{year} Player row here and were skipped: {missing}")
        if options['dry_run']:
            print("[dry run] rolled back — nothing was written.")

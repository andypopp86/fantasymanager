import logging
logger = logging.getLogger(__name__)

from django.core.management.base import BaseCommand
from django.utils import timezone

from draft.management.commands.add_players import refresh_players_from_ffc


class Command(BaseCommand):
    help = ('Re-pull ADP from Fantasy Football Calculator and refresh players, '
            'projected prices, and NFL team links for the current year. '
            'Same import as add_players (kept as the in-season alias).')

    def handle(self, *args, **options):
        summary = refresh_players_from_ffc()
        if not summary.priced:
            self.stdout.write(self.style.WARNING(
                'no HistoricalDraftPicks - projected prices left untouched'))
        for name in summary.created_names:
            self.stdout.write(f'  created {name}')
        self.stdout.write(self.style.SUCCESS(
            f'refreshed {summary.feed_rows} FFC rows for {summary.year}: '
            f'{len(summary.created)} created, {summary.updated} updated'))

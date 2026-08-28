import logging

from django.core.management.base import BaseCommand, CommandError

from draft.services.adp.apply import PRICE_BASIS_CHOICES, apply_source, source_status
from draft.services.adp.sources import SOURCE_KEYS

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        'Make one already-synced ADP source the effective one: re-derive '
        'adp_formatted from its column and re-price off the new order. Makes NO '
        'API call - the data is already in the database, so toggling is free and '
        'reversible. Players the source does not rank keep their existing ADP '
        'and price.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--source', required=False,
            help=f'One of {", ".join(SOURCE_KEYS)}. Omit to list what is synced.')
        parser.add_argument('--year', type=int, default=None)
        parser.add_argument(
            '--price-basis', default='historical', choices=PRICE_BASIS_CHOICES,
            help='historical (default) = average HistoricalDraftPicks price per rank; '
                 'default = the hardcoded add_default_prices curve; none = leave '
                 'prices alone and only move ADP.')
        parser.add_argument(
            '--dry-run', action='store_true', default=False,
            help='Report what would change, write nothing.')

    def handle(self, *args, **options):
        if not options['source']:
            self._list_status(options['year'])
            return

        if options['source'] not in SOURCE_KEYS:
            raise CommandError(
                f'unknown source {options["source"]!r} - expected one of '
                f'{", ".join(SOURCE_KEYS)}')

        if options['dry_run']:
            self.stdout.write(self.style.WARNING('DRY RUN - nothing will be written\n'))

        report = apply_source(
            options['source'], year=options['year'],
            price_basis=options['price_basis'], dry_run=options['dry_run'],
        )
        self._report(report)

    def _list_status(self, year):
        self.stdout.write(self.style.MIGRATE_HEADING('Synced ADP sources'))
        for source, record in source_status(year):
            if record is None:
                self.stdout.write(f'  {source.key:8} {source.label:30} never synced')
                continue
            active = ' [ACTIVE]' if record.is_active else ''
            self.stdout.write(
                f'  {source.key:8} {source.label:30} '
                f'synced {record.synced_at:%Y-%m-%d %H:%M}, '
                f'{record.matched} matched, {record.unmatched} unmatched{active}')
        self.stdout.write('\nPass --source <key> to make one effective.')

    def _report(self, report):
        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\nApplied {report.label} ({report.source}) for {report.year}'))
        if report.caveat:
            self.stdout.write(self.style.WARNING(f'  note: {report.caveat}'))
        if report.synced_at is None:
            self.stdout.write(self.style.ERROR(
                '  this source has never been synced - every player is unranked'))
        if report.previous_source and report.previous_source != report.source:
            self.stdout.write(f'  previous source: {report.previous_source}')

        self.stdout.write(f'  ranked:   {report.ranked} players re-derived from this source')
        self.stdout.write(
            f'  unranked: {report.unranked} not covered - ADP and price left untouched')
        self.stdout.write(f'  pricing:  {report.price_note}')
        if report.priced:
            self.stdout.write(f'            {report.priced} prices recalculated')

        if report.top:
            self.stdout.write('\n  Top 25:')
            for index, player in enumerate(report.top, start=1):
                self.stdout.write(
                    f'    {index:>3}. {player.adp_formatted:>6} '
                    f'{player.name:28} {player.position:4} ${player.projected_price}')

        if report.movers:
            self.stdout.write('\n  Biggest ADP moves vs the previous source:')
            for move in report.movers:
                direction = 'up' if move.delta_ranks > 0 else 'down'
                self.stdout.write(
                    f'    {move.name:28} {move.position:4} '
                    f'{move.previous} -> {move.current} '
                    f'({direction} {abs(move.delta_ranks)} picks)')

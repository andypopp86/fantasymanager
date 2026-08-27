import logging

from django.core.management.base import BaseCommand

from draft.services.adp.sources import SOURCE_KEYS
from draft.services.adp.sync import sync_source

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        'Pull one or more ADP sources into their own Player columns. Writes ONLY '
        'adp_<source> (and the cached provider id) - never adp_formatted, never a '
        'price, and never creates a player. Run apply_adp_source afterwards to '
        'make one of them effective.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--source', default='all',
            help=f'{", ".join(SOURCE_KEYS)}, or "all" (the default).')
        parser.add_argument('--year', type=int, default=None)
        parser.add_argument(
            '--dry-run', action='store_true', default=False,
            help='Fetch and match, report, write nothing.')
        parser.add_argument(
            '--show-unmatched', action='store_true', default=False,
            help='Print every unmatched feed row, not just the first 20.')

    def handle(self, *args, **options):
        keys = SOURCE_KEYS if options['source'] == 'all' else (options['source'],)
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - nothing will be written\n'))

        for key in keys:
            summary = sync_source(key, year=options['year'], dry_run=dry_run)
            self._report(summary, options['show_unmatched'])

    def _report(self, summary, show_unmatched):
        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\n{summary.label} ({summary.source}) - {summary.year}'))

        if not summary.ok:
            self.stdout.write(self.style.ERROR(f'  FAILED: {summary.error}'))
            return

        sample = (f', {summary.sample_size} {summary.sample_unit}'
                  if summary.sample_size else '')
        self.stdout.write(f'  feed rows:     {summary.feed_rows}{sample}')
        self.stdout.write(f'  matched:       {summary.matched}')
        if summary.fuzzy_matched:
            # Worth reading every time: this is where a wrong player quietly
            # inherits someone else's ADP.
            self.stdout.write(self.style.WARNING(
                f'  fuzzy matched: {summary.fuzzy_matched} (verify these)'))
        if summary.ids_learned:
            self.stdout.write(
                f'  ids learned:   {summary.ids_learned} (next sync skips name matching)')
        self.stdout.write(f'  unmatched:     {summary.unmatched}')

        if summary.unmatched_names:
            shown = summary.unmatched_names if show_unmatched else summary.unmatched_names[:20]
            for name in shown:
                self.stdout.write(f'    - {name}')
            if len(shown) < summary.unmatched:
                self.stdout.write(
                    f'    ... and {summary.unmatched - len(shown)} more '
                    f'(--show-unmatched for all)')

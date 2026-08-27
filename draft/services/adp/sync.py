"""Pulling one ADP source into its own column.

The whole discipline of this module is what it does NOT do. A sync writes:

  * `Player.adp_<source>` for the rows it matched
  * `Player.<source>_id` for the ids it learned
  * one `AdpSourceSync` row of metadata

and nothing else. It never touches `adp_formatted`, never touches any price,
never creates a Player. That separation is the point of the feature: pulling a
feed is safe to run at any time, and only `apply_source` changes what the board
sees. The `update_fields` on the save below is what enforces it — widen it and
you have quietly given a sync the power to move prices.

Unmatched rows are recorded by name and dropped. FFC remains the roster source,
and `Player.adp_formatted` is NOT NULL, so a stub row for an unmatched name
would need an ADP invented for it that would then feed the price curve.
"""

import dataclasses
import logging

from django.utils import timezone

from draft import models as d
from draft.services.adp.matching import PlayerMatcher
from draft.services.adp.sources import get_source

logger = logging.getLogger(__name__)


@dataclasses.dataclass
class SyncSummary:
    """What one source's sync did. Rendered by both the command and the admin."""

    source: str
    label: str
    year: int
    feed_rows: int = 0
    matched: int = 0
    fuzzy_matched: int = 0
    unmatched_names: list = dataclasses.field(default_factory=list)
    ids_learned: int = 0
    sample_size: int = None
    sample_unit: str = ''
    dry_run: bool = False
    # Set when the feed itself failed, so one bad provider doesn't abort a
    # `--source all` run or a multi-source admin submit.
    error: str = ''

    @property
    def unmatched(self):
        return len(self.unmatched_names)

    @property
    def ok(self):
        return not self.error


def sync_source(source_key, year=None, dry_run=False):
    """Pull one source and write only its column. Returns a SyncSummary."""
    source = get_source(source_key)
    year = year or timezone.now().year
    summary = SyncSummary(
        source=source.key, label=source.label, year=year,
        sample_unit=source.sample_unit, dry_run=dry_run,
    )

    try:
        feed = source.fetch(year)
    except Exception as exc:
        # Network, JSON shape, a provider changing its schema mid-season. Report
        # it and let the caller carry on with the other sources.
        logger.warning('%s ADP fetch failed: %s', source.label, exc)
        summary.error = str(exc)
        return summary

    summary.feed_rows = len(feed.rows)
    summary.sample_size = feed.sample_size

    matcher = PlayerMatcher(year, id_field=source.id_field, persist_id=source.persist_id)
    for row in feed.rows:
        result = matcher.match(row)
        if not result.matched:
            summary.unmatched_names.append(f'{row.name} ({row.position})')
            continue

        summary.matched += 1
        if result.is_fuzzy:
            summary.fuzzy_matched += 1

        player = result.player
        setattr(player, source.adp_field, round(row.overall_pick, 2))
        fields = [source.adp_field]
        if matcher.remember(player, row.provider_id):
            summary.ids_learned += 1
            fields.append(source.id_field)

        if not dry_run:
            # NOT player.save(): Player.save() floors projected_price at 1, and
            # a sync has no business touching a price at all. update_fields on
            # the queryset bypasses that override and writes exactly these
            # columns.
            d.Player.objects.filter(pk=player.pk).update(
                **{field: getattr(player, field) for field in fields})

    if not dry_run:
        record, _ = d.AdpSourceSync.objects.update_or_create(
            source=source.key, year=year,
            defaults={
                'feed_rows': summary.feed_rows,
                'matched': summary.matched,
                'fuzzy_matched': summary.fuzzy_matched,
                'unmatched': summary.unmatched,
                # Capped: FantasyPros' 941-row feed against a 212-player DB
                # leaves ~700 unmatched, and the point is to spot a missing
                # STAR, which will be near the top of a rank-ordered feed.
                'unmatched_names': '\n'.join(summary.unmatched_names[:100]),
                'sample_size': summary.sample_size,
            },
        )
        logger.info('synced %s ADP for %s: %s matched, %s unmatched',
                    source.key, year, summary.matched, summary.unmatched)

    if summary.matched and summary.unmatched > summary.matched:
        # Not necessarily wrong — a deep feed against a shallow DB does this by
        # construction — but worth a line on the admin page either way.
        logger.warning(
            '%s: %s of %s feed rows did not match a player in this DB',
            source.label, summary.unmatched, summary.feed_rows)

    return summary


def sync_all(year=None, dry_run=False, sources=None):
    """Sync several sources, isolating each one's failure."""
    from draft.services.adp.sources import SOURCE_KEYS

    return [sync_source(key, year=year, dry_run=dry_run)
            for key in (sources or SOURCE_KEYS)]

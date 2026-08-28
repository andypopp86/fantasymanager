"""Collapsing every ADP column to a dense integer rank.

Each ADP column holds a position, not a measurement: 1 is the first player off
the board. That is a deliberate change from what the feeds publish, because the
feeds do not share a unit — FFC and MFL report an average overall pick over
different draft pools (MFL's look like 7.74), FantasyPros reports a consensus
rank, and `adp_formatted` used to carry FFC's round.pick rendering ("3.05").
Three different units on one row cannot be compared by eye, which is the only
reason to display them side by side.

**This has to run after anything that adds or repoints players.** The FFC
refresh creates players and writes feed-order values; a new player inserted in
the middle leaves the ranks with a hole or a duplicate until they are rebuilt.
`refresh_players_from_ffc` calls this at the end for that reason, and
`rerank_adp` exists so it can be re-run by hand at any time.

Idempotent by construction: ranking an already-ranked column reproduces it
exactly, so running this more often than needed costs nothing but a query.
"""

import dataclasses
import logging

from django.utils import timezone

from draft import models as d

logger = logging.getLogger(__name__)

# Every column that holds a rank. `adp_formatted` is the effective one the board
# sorts on; the rest are per-source and nullable.
RANKED_COLUMNS = ('adp_formatted', 'adp_ffc', 'adp_sharks', 'adp_fpros')


@dataclasses.dataclass
class ColumnRerank:
    column: str
    ranked: int = 0
    unranked: int = 0
    changed: int = 0


@dataclasses.dataclass
class RerankReport:
    year: int
    dry_run: bool = False
    columns: list = dataclasses.field(default_factory=list)

    @property
    def total_changed(self):
        return sum(column.changed for column in self.columns)


def rerank_year(year=None, columns=None, dry_run=False):
    """Rebuild 1..N ranks for `columns` (default: all) within one year.

    Ordering is by the column's current value, with `name` as a tiebreaker so
    two players sharing a value get a stable, reproducible order rather than one
    that depends on how the rows happen to come back. NULLs are left NULL —
    a source that doesn't rank a player must not be given an opinion here.
    """
    year = year or timezone.now().year
    report = RerankReport(year=year, dry_run=dry_run)

    for column in (columns or RANKED_COLUMNS):
        if column not in RANKED_COLUMNS:
            raise ValueError(f'{column!r} is not a ranked ADP column')

        # `.order_by(column, 'name')` also clears Player.Meta.ordering, which
        # matters: Django folds ordering columns into DISTINCT/GROUP BY and that
        # bit this feature once already (see migration 0089).
        rows = list(
            d.Player.objects
            .filter(year=year)
            .exclude(**{f'{column}__isnull': True})
            .order_by(column, 'name')
        )
        result = ColumnRerank(
            column=column,
            ranked=len(rows),
            unranked=d.Player.objects.filter(year=year, **{f'{column}__isnull': True}).count(),
        )

        moved = []
        for index, obj in enumerate(rows, start=1):
            if getattr(obj, column) == index:
                continue
            result.changed += 1
            setattr(obj, column, index)
            moved.append(obj)

        if moved and not dry_run:
            # bulk_update, not a save() per row: Player.save() floors
            # projected_price at 1, and reranking has no business touching a
            # price. It is also the difference between one statement and N —
            # this runs inline in the admin refresh request.
            d.Player.objects.bulk_update(moved, [column], batch_size=500)

        report.columns.append(result)
        if result.changed:
            logger.info('reranked %s for %s: %s of %s rows moved',
                        column, year, result.changed, result.ranked)

    return report

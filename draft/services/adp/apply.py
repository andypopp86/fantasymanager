"""Making one synced source the effective one. No network.

This is the toggle. Everything the board, the serializers and the server-side
sorts read is `Player.adp_formatted`, so switching sources means re-deriving
that one column from whichever `adp_<source>` column you picked, then re-pricing
off the new order. Because the ADP is already in the database, that is pure
arithmetic — no API call, and it is safe to flip back and forth.

Two rules govern what gets touched:

  * Only players the source actually RANKS are rewritten. A player the source
    doesn't cover keeps their existing `adp_formatted` and `projected_price`
    untouched, and gets `adp_source=''` to mark them as left over. Coverage
    varies a lot between feeds, and burying a real player at the bottom of the
    board because a name failed to match is the failure mode worth avoiding.
  * Prices follow ADP order, not the feed's row order. The old FFC import
    indexed the price curve by position in the feed; ranking explicitly here
    means a source that returns rows in any order still prices correctly.
"""

import dataclasses
import logging
from decimal import Decimal

from django.utils import timezone

from draft import models as d
from draft.management.commands.add_players import compute_average_adp_prices
from draft.management.commands.add_default_prices import price_list as DEFAULT_PRICE_LIST
from draft.services.adp.sources import SOURCE_KEYS, get_source

logger = logging.getLogger(__name__)

# The league this board is built for, and the basis of `adp_formatted`'s
# round.pick rendering. Matches the `teams=10` hardcoded in the FFC pull.
TEAMS = 10

PRICE_BASIS_CHOICES = ('historical', 'default', 'none')


def to_round_pick(overall_pick):
    """Overall average pick -> the round.pick Decimal stored in adp_formatted.

    Reproduces FFC's own formatting so switching sources doesn't change what the
    number MEANS: pick 80.8 becomes 9.01, pick 92.1 becomes 10.02. Rounding the
    overall pick before splitting is what matches FFC; truncating does not.

    Checked against the live FFC feed: 198 of its 207 non-kicker rows come out
    identical. All 9 disagreements sit on an exact .5 tie, where FFC is not even
    self-consistent (12.5 -> 2.03 rounds up, 1.5 -> 1.01 rounds down) because the
    `adp` it publishes is already rounded to one decimal, so the true value
    behind a displayed .5 could be either side. Ties are therefore arbitrary by
    construction and not worth chasing — one pick of drift on a player whose ADP
    is a fractional average anyway.
    """
    overall = max(1, int(round(float(overall_pick))))
    rnd = (overall - 1) // TEAMS + 1
    pick = (overall - 1) % TEAMS + 1
    return Decimal(f'{rnd}.{pick:02d}')


def resolve_price_curve(basis):
    """The list of auction prices by draft rank, or None to leave prices alone.

    'historical' is the real basis — average `HistoricalDraftPicks` price at each
    rank. When the DB has no history (the dev Mac), it deliberately returns None
    rather than falling through to the hardcoded curve, preserving the existing
    guard: a silent flattening of every price looks identical to success.
    """
    if basis == 'none':
        return None, 'prices not recalculated (--price-basis none)'
    if basis == 'default':
        return list(DEFAULT_PRICE_LIST), 'hardcoded default curve'
    curve = compute_average_adp_prices()
    if not curve:
        logger.warning(
            'no HistoricalDraftPicks in this DB - leaving projected_price untouched '
            '(pass --price-basis default for the hardcoded curve)')
        return None, 'no HistoricalDraftPicks - prices left untouched'
    return curve, 'historical auction averages'


@dataclasses.dataclass
class Move:
    """One player's ADP change, for the "biggest movers" report."""

    name: str
    position: str
    previous: Decimal
    current: Decimal
    # Positive = the new source ranks them EARLIER (more valuable).
    delta_ranks: int


@dataclasses.dataclass
class ApplyReport:
    source: str
    label: str
    year: int
    ranked: int = 0
    unranked: int = 0
    priced: int = 0
    price_note: str = ''
    caveat: str = ''
    previous_source: str = ''
    dry_run: bool = False
    top: list = dataclasses.field(default_factory=list)
    movers: list = dataclasses.field(default_factory=list)
    synced_at: object = None


def apply_source(source_key, year=None, price_basis='historical', dry_run=False):
    """Make `source_key` the effective ADP for `year`. Returns an ApplyReport."""
    source = get_source(source_key)
    year = year or timezone.now().year
    if price_basis not in PRICE_BASIS_CHOICES:
        raise ValueError(f'price_basis must be one of {", ".join(PRICE_BASIS_CHOICES)}')

    record = d.AdpSourceSync.objects.filter(source=source.key, year=year).first()
    previous = d.AdpSourceSync.objects.filter(year=year, is_active=True).first()
    report = ApplyReport(
        source=source.key, label=source.label, year=year,
        caveat=source.caveat, dry_run=dry_run,
        previous_source=previous.source if previous else '',
        synced_at=record.synced_at if record else None,
    )
    if record is None:
        logger.warning(
            '%s has never been synced for %s - run sync_adp --source %s first',
            source.label, year, source.key)

    players = list(d.Player.objects.filter(year=year))
    ranked = [p for p in players if getattr(p, source.adp_field) is not None]
    unranked = [p for p in players if getattr(p, source.adp_field) is None]
    ranked.sort(key=lambda p: (getattr(p, source.adp_field), p.name))
    report.ranked = len(ranked)
    report.unranked = len(unranked)

    curve, report.price_note = resolve_price_curve(price_basis)

    for index, player in enumerate(ranked):
        previous_adp = player.adp_formatted
        player.adp_formatted = to_round_pick(getattr(player, source.adp_field))
        player.adp_source = source.key
        fields = ['adp_formatted', 'adp_source']

        if curve is not None:
            # Past the end of the curve everyone is a $1 dart throw; the
            # historical basis simply runs out of drafted players there.
            price = round(curve[index], 2) if index < len(curve) else 1
            player.projected_price = max(price, 1)
            fields.append('projected_price')
            report.priced += 1

        if previous_adp != player.adp_formatted:
            report.movers.append(Move(
                name=player.name, position=player.position,
                previous=previous_adp, current=player.adp_formatted,
                delta_ranks=_rank_delta(previous_adp, player.adp_formatted),
            ))

        if not dry_run:
            # Bypasses Player.save()'s projected_price flooring, which would
            # otherwise fire on every row whether or not we're pricing.
            d.Player.objects.filter(pk=player.pk).update(
                **{field: getattr(player, field) for field in fields})

    # Coverage gaps are MARKED, not rewritten: their ADP and price stay exactly
    # as the previous source left them.
    if not dry_run and unranked:
        d.Player.objects.filter(pk__in=[p.pk for p in unranked]).update(adp_source='')

    report.top = ranked[:25]
    report.movers.sort(key=lambda m: abs(m.delta_ranks), reverse=True)
    report.movers = report.movers[:25]

    if not dry_run:
        d.AdpSourceSync.objects.filter(year=year).update(is_active=False)
        d.AdpSourceSync.objects.update_or_create(
            source=source.key, year=year, defaults={'is_active': True})
        logger.info('applied %s ADP for %s: %s ranked, %s unranked',
                    source.key, year, report.ranked, report.unranked)

    return report


def _rank_delta(previous, current):
    """Round.pick difference expressed in whole picks, for sorting movers."""
    if previous is None or current is None:
        return 0
    return int(round((_to_overall(previous) - _to_overall(current))))


def _to_overall(round_pick):
    """Inverse of to_round_pick, for comparing two round.pick values."""
    value = float(round_pick)
    rnd = int(value)
    pick = int(round((value - rnd) * 100))
    return (rnd - 1) * TEAMS + max(pick, 1)


def active_source(year=None):
    """Which source is currently driving the board, or '' if none was applied."""
    year = year or timezone.now().year
    record = d.AdpSourceSync.objects.filter(year=year, is_active=True).first()
    return record.source if record else ''


def source_status(year=None):
    """One row per source for the admin's toggle page: synced_at, coverage,
    whether it is active. Sources never synced appear with `record=None`."""
    year = year or timezone.now().year
    records = {r.source: r for r in d.AdpSourceSync.objects.filter(year=year)}
    return [(get_source(key), records.get(key)) for key in SOURCE_KEYS]

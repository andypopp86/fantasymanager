"""The one shape every ADP provider is normalised into.

Each feed speaks its own dialect — MFL numeric ids and "Last, First" names,
FantasyPros an expert rank, FFC a round.pick string alongside a raw float. The
provider modules do all of that translation so that everything downstream (the
matcher, the sync, the apply step) sees a single flat row type and never has to
branch on which source it came from.
"""

import dataclasses


# Every provider maps its own position vocabulary onto these. Anything a feed
# offers outside this set — kickers, and MFL's IDP ranks — is dropped at the
# provider, so an IDP linebacker can never occupy a slot in the price curve.
CANONICAL_POSITIONS = ('QB', 'RB', 'WR', 'TE', 'DEF')


@dataclasses.dataclass(frozen=True)
class AdpRow:
    """One player's ADP as a provider reports it, translated.

    `sort_value` is an ORDERING KEY, ascending — lower means drafted earlier. It
    is deliberately not named for a unit, because the providers do not share
    one: FFC reports an average overall pick, MFL an auction-value rank,
    FantasyPros an expert consensus rank. All three sort the same way, and
    ordering is the only thing anything downstream consumes (the sync turns it
    into a dense rank immediately, and the price curve is index-based).

    A provider whose feed is "higher is better" — MFL's auction values — must
    invert before putting a number here.
    """

    provider_id: str
    name: str
    position: str
    team_code: str
    sort_value: float


@dataclasses.dataclass
class FeedResult:
    """A parsed feed plus the provider's own sample size.

    `sample_size` means different things per source (MFL counts drafts,
    FantasyPros counts experts), which is deliberate — it's shown to a human who
    knows which source they picked, and normalising it away would destroy the
    only signal about how much the feed can be trusted.
    """

    rows: list
    sample_size: int = None

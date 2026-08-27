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

    `overall_pick` is the unit that makes sources comparable: the average
    OVERALL pick number, not round.pick. FantasyPros is the honest exception —
    it has no average pick, so its consensus rank goes here instead. That's
    sound because everything consuming this only uses the ordering, but it is
    why the model field carries a warning comment.
    """

    provider_id: str
    name: str
    position: str
    team_code: str
    overall_pick: float


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

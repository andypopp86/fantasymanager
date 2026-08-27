"""The registry of ADP sources.

Adding a provider is meant to be: write a `providers/<key>.py` exposing
`fetch(year) -> FeedResult`, add a `Player.adp_<key>` column (and an id column if
the feed has stable ids worth remembering), and add one entry here. Nothing else
in the feature branches on the source — the sync, the apply step, the commands
and the admin all read this table.

ESPN's undocumented `kona_player_info` endpoint is the obvious next entry if it
is ever wanted: it returns 400 rows with `ownership.averageDraftPosition` and an
`auctionValueAverage` that would be directly useful for pricing. It was left out
deliberately, not because it doesn't work.
"""

import dataclasses

from draft.services.adp.providers import ffc, fpros, mfl


@dataclasses.dataclass(frozen=True)
class Source:
    key: str
    label: str
    # Player column holding this source's overall average pick.
    adp_field: str
    # Player column caching this provider's own id, or None.
    id_field: str
    # Whether a resolved id gets written back. False for FFC, whose ids are
    # already Player.player_id.
    persist_id: bool
    # What the provider's sample_size counts, for labelling in the admin.
    sample_unit: str
    fetch: object
    # A caveat a human should see before toggling to this source. Empty for the
    # sources that report honest market ADP.
    caveat: str = ''


SOURCES = {
    'ffc': Source(
        key='ffc',
        label='Fantasy Football Calculator',
        adp_field='adp_ffc',
        id_field='player_id',
        persist_id=False,
        sample_unit='drafts',
        fetch=ffc.fetch,
        caveat='Free public mock drafts - fresh, but a casual drafter pool.',
    ),
    'mfl': Source(
        key='mfl',
        label='MyFantasyLeague',
        adp_field='adp_mfl',
        id_field='mfl_id',
        persist_id=True,
        sample_unit='drafts',
        fetch=mfl.fetch,
        caveat='Real MFL leagues, but mocks are mixed in - IS_MOCK does not filter this feed.',
    ),
    'fpros': Source(
        key='fpros',
        label='FantasyPros ECR',
        adp_field='adp_fpros',
        id_field='fpros_id',
        persist_id=True,
        sample_unit='experts',
        fetch=fpros.fetch,
        caveat='Expert consensus RANK, not ADP - what analysts think, not what drafters do.',
    ),
}

# Order the UI and `--source all` iterate in.
SOURCE_KEYS = tuple(SOURCES)


def get_source(key):
    try:
        return SOURCES[key]
    except KeyError:
        raise ValueError(
            f'unknown ADP source {key!r} - expected one of {", ".join(SOURCE_KEYS)}')

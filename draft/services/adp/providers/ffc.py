"""Fantasy Football Calculator, as an ADP SOURCE.

FFC has two jobs in this codebase and they should not be confused:

  1. Roster source — `add_players.refresh_players_from_ffc()` creates and
     updates Player rows, links teams, and sets `adp_formatted`/`projected_price`
     directly. That path is untouched by multi-source ADP and remains the only
     thing that creates players.
  2. One of several ADP sources — this module, which reads the same feed and
     writes only `Player.adp_ffc`, so FFC can be toggled against MFL and
     FantasyPros on equal terms.

The HTTP call is deliberately NOT reimplemented here: `add_players.get_data` is
the one place the FFC feed is fetched, and it stays that way.

Note the unit change. The feed carries both `adp` (raw overall average pick,
e.g. 1.5) and `adp_formatted` (FFC's own round.pick rendering, "1.01"). This
module stores the RAW one, because that is the unit every source is normalised
onto; `apply_source` re-derives round.pick from it.
"""

import logging

from draft.management.commands.add_players import get_data
from draft.services.adp.rows import AdpRow, FeedResult

logger = logging.getLogger(__name__)

# The feed says PK where the model says K, and this league drafts neither.
POSITION_MAP = {
    'QB': 'QB',
    'RB': 'RB',
    'WR': 'WR',
    'TE': 'TE',
    'DEF': 'DEF',
}


def parse(payload):
    """Pure: one FFC payload in, a FeedResult out."""
    rows = []
    for entry in payload.get('players', []):
        position = POSITION_MAP.get(entry.get('position'))
        if not position:
            continue
        try:
            overall_pick = float(entry['adp'])
        except (KeyError, TypeError, ValueError):
            logger.warning('FFC row for %s has an unreadable adp %r',
                           entry.get('name'), entry.get('adp'))
            continue
        rows.append(AdpRow(
            provider_id=str(entry.get('player_id') or ''),
            name=entry.get('name', ''),
            position=position,
            team_code=(entry.get('team') or '').upper(),
            overall_pick=overall_pick,
        ))

    sample_size = None
    try:
        sample_size = int(payload['meta']['total_drafts'])
    except (KeyError, TypeError, ValueError):
        pass
    return FeedResult(rows=rows, sample_size=sample_size)


def fetch(year):
    return parse(get_data(year))

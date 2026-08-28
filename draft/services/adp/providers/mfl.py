"""MyFantasyLeague AUCTION VALUES (AAV), not its ADP.

This deliberately reads `TYPE=aav` rather than `TYPE=adp`, and the reason is
worth keeping: MFL's ADP feed is badly superflex-contaminated. It ranks 7-8 QBs
inside its top 50 where FFC ranks 1, a median 28 ranks earlier by position, which
would inflate every QB price in a 1QB auction. No parameter filters it —
`IS_MOCK`, `IS_KEEPER`, `IS_PPR`, `FCOUNT` and `CUTOFF` were all measured and
none moved the QB density.

The AAV feed draws from a different population and does not have the problem:
superflex lives mostly in snake and dynasty formats, while auction leagues are
overwhelmingly 1QB. Measured, QBs inside the top 50 drop from 8 to 3 — in line
with FantasyPros (4), and close enough to FFC (1) to be usable. Same provider,
same drafters this board wanted a second opinion from, without the format skew.

`IS_KEEPER=N` restricts it to REDRAFT leagues. MFL's default is `NKR`, which
mixes in keeper and rookie-only drafts; rookie-only alone was 229 of 692 in the
ADP feed and put ~49 college players in its top 150. Valid letters are N
(redraft), K (keeper), R (rookie-only), combinable — the parameter rejects
anything else, which is why an earlier attempt with `IS_KEEPER=Redraft` errored
and made it look like the filter was broken.

Two structural quirks remain:

  * The feed carries ids and nothing else, so resolving a name needs a SECOND
    call to the player table (~2,600 rows). Both are unauthenticated.
  * It is not scoped to a roster type, so it includes IDP and kickers. Those are
    dropped here, at the provider, so nothing downstream can give an IDP
    linebacker a slot in the auction price curve.

The dollar figures are NOT stored. `Player.adp_mfl` holds a rank like every
other source, because that is what makes the columns comparable across a row.
MFL normalises AAV to a $1000 total pool, so if these are ever wanted as real
money they need scaling to this league's budget.
"""

import logging

import requests

from draft.services.adp.rows import AdpRow, FeedResult
from draft.services.adp.matching import flip_comma_name

logger = logging.getLogger(__name__)

# IS_KEEPER=N -> redraft leagues only. See the module docstring.
AAV_URL = 'https://api.myfantasyleague.com/{year}/export?TYPE=aav&JSON=1&IS_KEEPER=N'
PLAYERS_URL = 'https://api.myfantasyleague.com/{year}/export?TYPE=players&JSON=1'

# MFL's position vocabulary -> ours. Everything absent from this map is dropped:
# 'PK' plus the IDP ranks, and the 'TM*' team-unit rows (TMWR, TMRB...) which are
# aggregate stat entries, not draftable players in this league.
POSITION_MAP = {
    'QB': 'QB',
    'RB': 'RB',
    'WR': 'WR',
    'TE': 'TE',
    'Def': 'DEF',
}

# MFL sends an unauthenticated request straight to a block page without one.
HEADERS = {'User-Agent': 'fantasymanager/1.0'}


def _get(url):
    response = requests.get(url, headers=HEADERS, timeout=60)
    response.raise_for_status()
    return response.json()


def parse(aav_payload, players_payload):
    """Pure: two MFL payloads in, a FeedResult out. No network, so tests use
    fixtures."""
    aav = aav_payload['aav']
    by_id = {entry['id']: entry for entry in players_payload['players']['player']}

    rows = []
    for entry in aav['player']:
        meta = by_id.get(entry['id'])
        if not meta:
            # An id in the AAV feed with no row in the player table. Rare, and
            # unresolvable — there's no name to match on.
            logger.warning('MFL AAV id %s has no entry in the player table', entry['id'])
            continue
        position = POSITION_MAP.get(meta.get('position'))
        if not position:
            continue
        # MFL publishes its own rank alongside the value, already ordered by
        # value descending, so it can be used as the ascending sort key
        # directly. Falling back to -averageValue keeps the ordering correct if
        # the field ever disappears, since sort_value is ascending and auction
        # values run the other way.
        try:
            sort_value = float(entry['rank'])
        except (KeyError, TypeError, ValueError):
            try:
                sort_value = -float(entry['averageValue'])
            except (KeyError, TypeError, ValueError):
                logger.warning('MFL AAV row for %s has neither a usable rank nor value',
                               meta.get('name'))
                continue
        rows.append(AdpRow(
            provider_id=str(entry['id']),
            # "Gibbs, Jahmyr" -> "Jahmyr Gibbs". Defenses come through as
            # "Seahawks, Seattle", which flips to nonsense — harmless, because
            # the matcher resolves DEF on team code and never reads the name.
            name=flip_comma_name(meta.get('name', '')),
            position=position,
            team_code=(meta.get('team') or '').upper(),
            sort_value=sort_value,
        ))

    sample_size = None
    try:
        sample_size = int(aav['totalAuctions'])
    except (KeyError, TypeError, ValueError):
        pass
    return FeedResult(rows=rows, sample_size=sample_size)


def fetch(year):
    return parse(_get(AAV_URL.format(year=year)), _get(PLAYERS_URL.format(year=year)))

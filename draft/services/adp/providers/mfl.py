"""MyFantasyLeague ADP.

Real MFL league drafts rather than free public mocks, which is the whole reason
this source exists alongside FFC. Two quirks shape this module:

  * The ADP feed carries ids and nothing else, so resolving a name needs a
    SECOND call to the player table (~2,600 rows). Both are unauthenticated.
  * The feed is not scoped to a scoring format or a roster type, so it includes
    IDP (LB/DE/S/DT/CB) and kickers — ~91 of 389 rows. Those are dropped here,
    at the provider, so nothing downstream can accidentally give an IDP
    linebacker a slot in the auction price curve.

One correction worth recording: MFL documents an `IS_MOCK` parameter, but it
does NOT filter this endpoint — `IS_MOCK=0` and `IS_MOCK=1` both return the same
692 drafts. So this feed is real leagues AND mocks mixed, just a more serious
population than FFC's. Don't add the parameter back thinking it does something.
"""

import logging

import requests

from draft.services.adp.rows import AdpRow, FeedResult
from draft.services.adp.matching import flip_comma_name

logger = logging.getLogger(__name__)

ADP_URL = 'https://api.myfantasyleague.com/{year}/export?TYPE=adp&JSON=1&PERIOD=RECENT'
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


def parse(adp_payload, players_payload):
    """Pure: two MFL payloads in, a FeedResult out. No network, so tests use
    fixtures."""
    adp = adp_payload['adp']
    by_id = {}
    for entry in players_payload['players']['player']:
        by_id[entry['id']] = entry

    rows = []
    for entry in adp['player']:
        meta = by_id.get(entry['id'])
        if not meta:
            # An id in the ADP feed with no row in the player table. Rare, and
            # unresolvable — there's no name to match on.
            logger.warning('MFL ADP id %s has no entry in the player table', entry['id'])
            continue
        position = POSITION_MAP.get(meta.get('position'))
        if not position:
            continue
        try:
            overall_pick = float(entry['averagePick'])
        except (TypeError, ValueError):
            logger.warning('MFL ADP row for %s has an unreadable averagePick %r',
                           meta.get('name'), entry.get('averagePick'))
            continue
        rows.append(AdpRow(
            provider_id=str(entry['id']),
            # "Gibbs, Jahmyr" -> "Jahmyr Gibbs". Defenses come through as
            # "Seahawks, Seattle", which flips to nonsense — harmless, because
            # the matcher resolves DEF on team code and never reads the name.
            name=flip_comma_name(meta.get('name', '')),
            position=position,
            team_code=(meta.get('team') or '').upper(),
            overall_pick=overall_pick,
        ))

    sample_size = None
    try:
        sample_size = int(adp['totalDrafts'])
    except (KeyError, TypeError, ValueError):
        pass
    return FeedResult(rows=rows, sample_size=sample_size)


def fetch(year):
    return parse(_get(ADP_URL.format(year=year)), _get(PLAYERS_URL.format(year=year)))

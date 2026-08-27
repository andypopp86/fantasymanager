"""MyFantasyLeague ADP.

Real MFL league drafts rather than free public mocks, which is the whole reason
this source exists alongside FFC. Two quirks shape this module:

  * The ADP feed carries ids and nothing else, so resolving a name needs a
    SECOND call to the player table (~2,600 rows). Both are unauthenticated.
  * The feed is not scoped to a scoring format or a roster type, so it includes
    IDP (LB/DE/S/DT/CB) and kickers — ~91 of 389 rows. Those are dropped here,
    at the provider, so nothing downstream can accidentally give an IDP
    linebacker a slot in the auction price curve.

Three things about this feed's POPULATION, all measured, none filterable:

  * **Superflex contamination, and it is severe.** MFL ranks 7 QBs inside its
    top 50; FFC ranks 1. A 1QB league takes one or two. QBs come out a median
    28 ranks earlier than FFC and TEs 16 earlier, with WRs pushed 16 later —
    the exact signature of superflex/2QB leagues, which MFL is the platform of
    choice for. Applying this source to a 1QB auction inflates every QB price.
  * Dynasty/devy rookie drafts are mixed in: ~49 of its top 150 are college
    players. They match nothing in this DB and drop out, but they are why the
    raw ranks are not redraft ADP.
  * `IS_MOCK` does NOT filter this endpoint — `IS_MOCK=0` and `IS_MOCK=1` both
    return the same 692 drafts — and `IS_KEEPER` rejects every value it
    documents. Don't add either back thinking it does something.

None of that makes the source useless — it is a real-money population and a
genuine second opinion at RB/WR — but read a QB or TE rank from it with the
superflex skew in mind.
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

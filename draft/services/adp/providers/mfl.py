"""MyFantasyLeague ADP.

**This source is a COMPARISON COLUMN, not something to apply as the effective
source.** It is a genuine second opinion at RB and WR, and it is wrong about
quarterbacks in a way that will wreck a 1QB auction. The caveat in sources.py
says so on the admin confirm page. Everything below is why.

MFL has no 1QB view. Their own ADP report UI filters on position, rookies,
injuries, cutoff, franchise count, PPR, draft type, mock status and period —
there is no lineup or superflex filter anywhere, so this is not a paywall, it
simply does not exist. Measured against FFC, MFL ranks 8 QBs inside its top 50
where FFC ranks 1, a median 28 ranks earlier, with TE -16 and WR +16. That is
superflex bleeding into the averages, and nothing removes it.

TYPE=aav was tried as a way out and is WORSE. Auction leagues really are mostly
1QB, and QB density did drop to 3 in the top 50 — but auction values overvalue
established veterans so badly that the top of the board falls apart: McCaffrey
1st (FFC 7), Barkley 2nd (FFC 17), Henry 4th (FFC 10), against Gibbs 6th when he
is the consensus 1. Since projected_price is assigned by rank position, that put
$72 on McCaffrey and $67 on Barkley. Restricting to the most recent window
(PERIOD=AUG15, 207 of 232 auctions) gives the identical top, so it is not an
offseason artifact — the 232-auction sample is just too small and too skewed.
Don't switch back to aav.

Parameters, corrected against MFL's report UI, because the API docs are wrong in
two places and both errors cost time:

  * IS_MOCK is documented BACKWARDS. The API reference says 1 = mocks only,
    0 = exclude mocks. The UI is the truth: 0 = All Drafts, 1 = EXCLUDE mocks,
    2 = mocks only. With the correct values, IS_MOCK=1 returns totalDrafts: 0 —
    every one of MFL's ~290 recent redraft drafts is a MOCK. So this feed is the
    same KIND of data as FFC's, just from a superflex-heavy user base. There is
    no non-mock MFL population to filter down to.
  * IS_KEEPER takes letters N/K/R (redraft, keeper, rookie-only), combinable,
    and supports bracket syntax like [NK]. It rejects anything else, which is
    why an early attempt with IS_KEEPER=Redraft errored and made the parameter
    look broken. The default NKR was mixing in 229 rookie-only drafts out of
    692, which is where ~49 college players in the top 150 came from.
    IS_KEEPER=N removes them and is kept below.
  * The franchise filter is FCOUNT (8/10/12/14/16), not FRANCHISES.
  * IS_PPR values in the UI are 3=any, 1=non-PPR, 2=PPR — not the -1/0/1 the
    API reference lists.

Two structural quirks:

  * The feed carries ids and nothing else, so resolving a name needs a SECOND
    call to the player table (~2,600 rows). Both are unauthenticated.
  * It is not scoped to a roster type, so it includes IDP and kickers. Those are
    dropped here, at the provider, so nothing downstream can give an IDP
    linebacker a slot in the auction price curve.
"""

import logging

import requests

from draft.services.adp.rows import AdpRow, FeedResult
from draft.services.adp.matching import flip_comma_name

logger = logging.getLogger(__name__)

# IS_KEEPER=N -> redraft only. PERIOD=RECENT -> the latest window MFL exposes.
# See the module docstring before changing either, and before adding IS_MOCK.
ADP_URL = ('https://api.myfantasyleague.com/{year}/export'
           '?TYPE=adp&JSON=1&PERIOD=RECENT&IS_KEEPER=N')
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
    by_id = {entry['id']: entry for entry in players_payload['players']['player']}

    rows = []
    # A filtered-to-nothing response (e.g. IS_MOCK=1) omits 'player' entirely
    # rather than returning an empty list.
    for entry in adp.get('player', []):
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
            sort_value = float(entry['averagePick'])
        except (TypeError, ValueError, KeyError):
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
            sort_value=sort_value,
        ))

    sample_size = None
    try:
        sample_size = int(adp['totalDrafts'])
    except (KeyError, TypeError, ValueError):
        pass
    return FeedResult(rows=rows, sample_size=sample_size)


def fetch(year):
    return parse(_get(ADP_URL.format(year=year)), _get(PLAYERS_URL.format(year=year)))

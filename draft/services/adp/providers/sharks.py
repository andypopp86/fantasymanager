"""FantasySharks expert rankings, served through MyFantasyLeague's API.

`TYPE=playerRanks` — MFL's own description is "overall player rankings from the
experts at FantasySharks.com". It takes a `SOURCE` parameter that in practice
only accepts `sharks`; `mfl`, `adp` and `aav` all return an empty set.

**This exists because MFL's own ADP is unusable for a 1QB league and this is the
only clean 1QB data MFL exposes.** Measured against FFC's 0/1/11 baseline, this
feed has 0 QBs in its top 30, 0 in its top 50 and 4 in its top 100 — it ranks
QBs LATER than FFC, which is the ordinary 1QB expert stance. MFL's `TYPE=adp`
had 8 in its top 50 (superflex bleeding in) and `TYPE=aav` wrecked the top of
the board with veteran overvaluation. Both were tried and both were dropped; the
history is in git and in AGENTS.md so neither gets attempted again.

Read it as EXPERT OPINION, not market data — the same category as FantasyPros,
and a single shop rather than FantasyPros' ~109-analyst consensus. FFC remains
the only market source on the board.

Why MFL's ADP could not be salvaged, since it looks like it should be possible:
`adp&DETAILS=1` lists the leagues in the sample, and `TYPE=league` publicly
exposes each one's `starters.position` QB `limit` ("1" = 1QB, "1-2" = superflex),
so the superflex leagues CAN be identified — 43% of the resolvable sample. But
`IS_MOCK=1` returns zero drafts, meaning MFL's entire recent redraft pool is
mock drafts, so a 1QB-filtered rebuild would yield ~71 mock drafts against FFC's
~8,000. Same kind of data, 1% of the sample, for ~320 API calls against an
endpoint that returns HTTP 429 under load. Not worth building.

Structural quirks:

  * The ranks feed carries ids and nothing else, so resolving names and
    positions needs a SECOND call to the player table (~2,600 rows). Both are
    unauthenticated. The ids are MFL's, which is why the cached id column is
    still `Player.mfl_id` — it is the MFL player id, whoever computed the ranks.
  * It is not scoped to a roster type, so it includes IDP and kickers (~900 of
    1,459 rows). Those are dropped here, at the provider.
  * Rows also carry `last_week` and `change`, i.e. rank movement. Not stored —
    the model keeps one number per source — but they are there if wanted.
"""

import logging

import requests

from draft.services.adp.rows import AdpRow, FeedResult
from draft.services.adp.matching import flip_comma_name

logger = logging.getLogger(__name__)

RANKS_URL = 'https://api.myfantasyleague.com/{year}/export?TYPE=playerRanks&JSON=1'
PLAYERS_URL = 'https://api.myfantasyleague.com/{year}/export?TYPE=players&JSON=1'

# MFL's position vocabulary -> ours. Everything absent is dropped: 'PK' plus the
# IDP ranks, and the 'TM*' team-unit rows which are aggregate stat entries.
POSITION_MAP = {
    'QB': 'QB',
    'RB': 'RB',
    'WR': 'WR',
    'TE': 'TE',
    'Def': 'DEF',
}

# MFL sends an unauthenticated request straight to a block page without one.
# It also rate-limits (HTTP 429) under sustained load, so keep call volume low —
# this provider is deliberately two calls, not per-player.
HEADERS = {'User-Agent': 'fantasymanager/1.0'}


def _get(url):
    response = requests.get(url, headers=HEADERS, timeout=60)
    response.raise_for_status()
    return response.json()


def parse(ranks_payload, players_payload):
    """Pure: two MFL payloads in, a FeedResult out. No network, so tests use
    fixtures."""
    ranks = ranks_payload['player_ranks']
    by_id = {entry['id']: entry for entry in players_payload['players']['player']}

    rows = []
    # A response filtered to nothing omits 'player' entirely rather than
    # returning an empty list.
    for entry in ranks.get('player', []):
        meta = by_id.get(entry['id'])
        if not meta:
            logger.warning('FantasySharks rank id %s has no entry in the MFL player table',
                           entry['id'])
            continue
        position = POSITION_MAP.get(meta.get('position'))
        if not position:
            continue
        try:
            sort_value = float(entry['rank'])
        except (KeyError, TypeError, ValueError):
            logger.warning('FantasySharks row for %s has an unreadable rank %r',
                           meta.get('name'), entry.get('rank'))
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

    # The feed reports no sample size: it is one analyst shop's ranking, not an
    # aggregate over drafts or experts.
    return FeedResult(rows=rows, sample_size=None)


def fetch(year):
    return parse(_get(RANKS_URL.format(year=year)), _get(PLAYERS_URL.format(year=year)))

"""FantasyPros expert consensus.

READ THIS BEFORE TRUSTING THE NUMBERS: this is not ADP. FantasyPros' actual ADP
data sits behind their paid API key — the `type=ADP` variant of this endpoint
returns `count: 0` for an unauthenticated caller. What comes back here is ECR,
the consensus RANK of ~109 experts, so `sort_value` carries an ordinal, not an
average pick.

That's still useful as a source, because the price curve and every sort consume
ordering alone. But it means this source reflects what analysts think rather
than what drafters do, which is a different question from the one FFC and MFL
answer. Keep that distinction when comparing columns.

Scoring is HALF to line up with the hardcoded `half-ppr` FFC pull in
`add_players.get_data` — the feeds differ substantially by format (HALF returns
941 players, PPR 517), so mixing them would compare different player pools.
"""

import logging

import requests

from draft.services.adp.rows import AdpRow, FeedResult

logger = logging.getLogger(__name__)

URL = (
    'https://partners.fantasypros.com/api/v1/consensus-rankings.php'
    '?sport=NFL&year={year}&week=0&experts=available&position=ALL'
    '&type=ST&scoring={scoring}&export=json'
)

DEFAULT_SCORING = 'HALF'

# FantasyPros already speaks close to our vocabulary; the only translation is
# DST -> DEF. 'K' is absent on purpose, which is what drops kickers.
POSITION_MAP = {
    'QB': 'QB',
    'RB': 'RB',
    'WR': 'WR',
    'TE': 'TE',
    'DST': 'DEF',
}

HEADERS = {'User-Agent': 'fantasymanager/1.0'}


def _get(url):
    response = requests.get(url, headers=HEADERS, timeout=60)
    response.raise_for_status()
    return response.json()


def parse(payload):
    """Pure: one FantasyPros payload in, a FeedResult out."""
    rows = []
    for entry in payload.get('players', []):
        position = POSITION_MAP.get(entry.get('player_position_id'))
        if not position:
            continue
        try:
            rank = float(entry['rank_ecr'])
        except (KeyError, TypeError, ValueError):
            logger.warning('FantasyPros row for %s has an unreadable rank_ecr %r',
                           entry.get('player_name'), entry.get('rank_ecr'))
            continue
        rows.append(AdpRow(
            provider_id=str(entry.get('player_id') or ''),
            # Defenses arrive as "Houston Texans"; the matcher ignores the name
            # for DEF and uses player_team_id below.
            name=entry.get('player_name', ''),
            position=position,
            team_code=(entry.get('player_team_id') or '').upper(),
            sort_value=rank,
        ))

    sample_size = None
    try:
        sample_size = int(payload['total_experts'])
    except (KeyError, TypeError, ValueError):
        pass
    return FeedResult(rows=rows, sample_size=sample_size)


def fetch(year, scoring=DEFAULT_SCORING):
    return parse(_get(URL.format(year=year, scoring=scoring)))

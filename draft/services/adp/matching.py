"""Resolving a provider's player row to a Player row in this DB.

This is the load-bearing part of multi-source ADP, because the Player table is
keyed on FFC's `player_id` and no other feed knows that id. Everything else in
the feature is arithmetic; this is the part that can quietly attach Marvin
Harrison Jr.'s ADP to Marvin Harrison.

The ordering below is a confidence ladder — exact identifiers first, then exact
names, then similarity, and a miss is a MISS. A provider row that reaches the
bottom is reported and dropped, never inserted: FFC is the roster source, and
`Player.adp_formatted` is NOT NULL, so a stub row would have to have an ADP
invented for it that would then feed the price curve and every server-side sort.

The one durable trick here is that a resolution is REMEMBERED. Once a name has
been matched, the provider's id is written to the Player, so the next sync
short-circuits to an exact lookup and the fuzzy pass only ever sees names that
are genuinely new. The risk of name matching is therefore paid once, and it
shrinks every run instead of being re-rolled.
"""

import difflib
import logging
import re
import unicodedata

from draft import models as d

logger = logging.getLogger(__name__)

# Suffixes are the single biggest source of near-misses across these feeds: FFC
# says "Marvin Harrison Jr.", MFL says "Harrison Jr., Marvin", FantasyPros says
# "Marvin Harrison Jr.". Dropping them entirely is safe here because the feeds
# do not carry a father and son at the same position in the same season.
_SUFFIXES = {'jr', 'sr', 'ii', 'iii', 'iv', 'v'}

# Below this, difflib's guesses stop being worth the risk of mis-assigning an
# ADP. Tuned against the real feeds: 0.85 accepts "D.J. Moore"/"DJ Moore" and
# rejects the Josh Allen QB/LB pair. Fuzzy hits are logged at WARNING so they
# land on the admin result page for a human to eyeball.
FUZZY_CUTOFF = 0.85

# The feeds do not agree on team codes, and this silently broke every team
# defense before it was caught: MFL says GBP/KCC/NEP/NOS/SFO/TBB/LVR/JAC,
# FantasyPros says JAC, and this DB (which takes its codes from FFC) says
# GB/KC/NE/NO/SF/TB/LV/JAX. Since defenses are matched on code alone, an
# unmapped dialect means that source contributes no DEF ADP at all.
#
# Maps any dialect onto the DB's vocabulary. Codes already canonical are absent
# by design — this is an override table, not a full list.
TEAM_CODE_ALIASES = {
    'GBP': 'GB',
    'KCC': 'KC',
    'NEP': 'NE',
    'NOS': 'NO',
    'SFO': 'SF',
    'TBB': 'TB',
    'LVR': 'LV',
    'JAC': 'JAX',
    'WSH': 'WAS',   # ESPN's dialect, ready if that source is ever added
    'ARZ': 'ARI',
    # MFL's "no team" marker. Mapped to empty so it can never collide.
    'FA': '',
}

# Trailing words that turn a team name into a defense name, stripped to leave
# the city token: "Seattle Defense" -> "seattle".
_DEF_SUFFIX_WORDS = {'defense', 'def', 'dst', 'd', 'st'}


def canonical_team_code(code):
    """Fold a provider's team code onto the vocabulary this DB uses."""
    if not code:
        return ''
    upper = code.strip().upper()
    return TEAM_CODE_ALIASES.get(upper, upper)


def def_city_token(name):
    """The city part of a defense's name, for matching when no team code helps.

    "Seattle Defense" -> "seattle", "Green Bay Defense" -> "green bay". Used
    only as a fallback for defenses whose Player row has no team link, which
    does happen (this DB has one).
    """
    words = [w for w in normalize_name(name).split() if w not in _DEF_SUFFIX_WORDS]
    return ' '.join(words)


def normalize_name(name):
    """Fold a player name to a comparable key.

    Strips accents, punctuation, case and generational suffixes, so
    "Ja'Marr Chase", "JaMarr Chase" and "ja marr  chase" all collapse together.
    """
    if not name:
        return ''
    # NFD then drop combining marks: "Ekelér" -> "Ekeler".
    decomposed = unicodedata.normalize('NFD', name)
    stripped = ''.join(c for c in decomposed if not unicodedata.combining(c))
    cleaned = re.sub(r"[^a-z0-9\s]", ' ', stripped.lower())
    words = [w for w in cleaned.split() if w not in _SUFFIXES]
    return ' '.join(words)


def flip_comma_name(name):
    """"Gibbs, Jahmyr" -> "Jahmyr Gibbs". MFL's format, and only MFL's.

    Note the suffix rides with the SURNAME on that side ("Walker III, Kenneth"),
    so flipping produces "Kenneth Walker III" — which `normalize_name` then
    discards anyway. A name with no comma is returned untouched, so this is safe
    to call unconditionally.
    """
    if ',' not in name:
        return name.strip()
    surname, _, given = name.partition(',')
    return f'{given.strip()} {surname.strip()}'.strip()


class MatchResult:
    """What one feed row resolved to, and how confidently."""

    def __init__(self, row, player, method):
        self.row = row
        self.player = player
        # 'id' | 'exact' | 'team' | 'fuzzy' | None
        self.method = method

    @property
    def matched(self):
        return self.player is not None

    @property
    def is_fuzzy(self):
        return self.method == 'fuzzy'


class PlayerMatcher:
    """Resolves feed rows against one year of Players.

    Builds its indexes once, up front, because a sync resolves hundreds of rows
    and the alternative is a query per row against a table that comfortably fits
    in memory (212 players for 2026).
    """

    def __init__(self, year, id_field=None, persist_id=True):
        self.year = year
        # e.g. 'mfl_id'. FFC passes 'player_id' — its ids ARE this table's
        # identity column, so they're read but never written back.
        self.id_field = id_field
        self.persist_id = persist_id
        self.players = list(d.Player.objects.filter(year=year))

        self._by_provider_id = {}
        if id_field:
            for player in self.players:
                value = getattr(player, id_field, None)
                if value:
                    self._by_provider_id[str(value)] = player

        # (normalized name, position) is the primary key for skill players. A
        # name colliding within one position is rare enough that first-wins is
        # acceptable; a name colliding ACROSS positions (Josh Allen) is exactly
        # why position is part of the key.
        self._by_name_pos = {}
        # Name alone, for the case where a feed disagrees about position (a TE
        # listed as WR). Only consulted after the position-qualified lookup, and
        # only when unambiguous.
        self._by_name = {}
        for player in self.players:
            key = (normalize_name(player.name), player.position)
            self._by_name_pos.setdefault(key, player)
            self._by_name.setdefault(normalize_name(player.name), []).append(player)

        # Team defenses are matched on TEAM CODE, never on name: the three feeds
        # call the Seattle defense "Seattle Defense", "Seahawks, Seattle" and
        # "Seattle Seahawks" respectively, and no amount of string similarity
        # makes those reliable. The code is stable once dialects are folded
        # together (see TEAM_CODE_ALIASES).
        self._def_by_team = {}
        # Fallback for defenses whose Player row has no team link — this DB has
        # one, and without this it could never receive ADP from any source.
        self._def_by_city = {}
        for player in self.players:
            if player.position != 'DEF':
                continue
            if player.team_id and player.team.code:
                self._def_by_team[canonical_team_code(player.team.code)] = player
            token = def_city_token(player.name)
            if token:
                self._def_by_city.setdefault(token, []).append(player)

        # Fuzzy candidates, bucketed by position so a WR can never be matched to
        # a QB no matter how similar the names are.
        self._names_by_pos = {}
        for player in self.players:
            self._names_by_pos.setdefault(player.position, []).append(normalize_name(player.name))

    def match(self, row):
        """Resolve one AdpRow. Returns a MatchResult; `.player` is None on a miss."""
        # 1. The id we learned on a previous run. Free and exact.
        if self.id_field and row.provider_id:
            player = self._by_provider_id.get(str(row.provider_id))
            if player:
                return MatchResult(row, player, 'id')

        # 2. Team defenses, by code. Ahead of name matching, not after it,
        #    because the names would produce confident nonsense.
        if row.position == 'DEF':
            player = self._def_by_team.get(canonical_team_code(row.team_code))
            if player:
                return MatchResult(row, player, 'team')
            # No code hit: try the city token, which is the one part of a
            # defense's name every feed spells the same way. Only accepted when
            # exactly one DB defense claims that city.
            feed_words = set(normalize_name(row.name).split())
            candidates = [
                players for token, players in self._def_by_city.items()
                if token and set(token.split()) <= feed_words
            ]
            if len(candidates) == 1 and len(candidates[0]) == 1:
                player = candidates[0][0]
                logger.warning(
                    'ADP match: defense "%s" matched to "%s" on city name - '
                    'it has no team link, so the team code could not be used',
                    row.name, player.name)
                return MatchResult(row, player, 'team')
            return MatchResult(row, None, None)

        key = normalize_name(row.name)

        # 3. Exact normalized name within the position.
        player = self._by_name_pos.get((key, row.position))
        if player:
            return MatchResult(row, player, 'exact')

        # 4. Exact name, position disagrees. Accepted only when the name is
        #    unique in the DB — otherwise we'd be guessing which of two players
        #    the feed meant, which is the one thing this ladder exists to avoid.
        candidates = self._by_name.get(key, [])
        if len(candidates) == 1:
            logger.warning(
                'ADP match: %s listed as %s by the feed, %s in the DB - matched on name',
                row.name, row.position, candidates[0].position)
            return MatchResult(row, candidates[0], 'exact')

        # 5. Similarity, within the position only.
        pool = self._names_by_pos.get(row.position, [])
        close = difflib.get_close_matches(key, pool, n=1, cutoff=FUZZY_CUTOFF)
        if close:
            player = self._by_name_pos.get((close[0], row.position))
            if player:
                logger.warning(
                    'ADP fuzzy match: feed "%s" (%s) -> "%s" - verify this is the same player',
                    row.name, row.position, player.name)
                return MatchResult(row, player, 'fuzzy')

        return MatchResult(row, None, None)

    def remember(self, player, provider_id):
        """Record the provider's id on the Player so the next sync skips
        straight to an exact lookup. Caller is responsible for saving.

        Returns True when it actually set something, so the caller knows whether
        the id column needs writing. No-ops for FFC, whose id is already this
        table's identity column.
        """
        if not (self.persist_id and self.id_field and provider_id):
            return False
        if str(getattr(player, self.id_field, '') or '') == str(provider_id):
            return False
        setattr(player, self.id_field, str(provider_id))
        self._by_provider_id[str(provider_id)] = player
        return True

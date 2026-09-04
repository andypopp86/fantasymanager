import logging

from django.utils import timezone
from django.core.validators import MaxValueValidator
from django.db import models

logger = logging.getLogger(__name__)

BUDGET_POSITIONS = (
    ('QB1', 'QB1'),
    ('RB1', 'RB1'),
    ('RB2', 'RB2'),
    ('WR1', 'WR1'),
    ('WR2', 'WR2'),
    ('TE1', 'TE1'),
    ('FLEX1', 'FLEX1'),
    ('FLEX2', 'FLEX2'),
    ('DEF1', 'DEF1'),
    ('BENCH1', 'BENCH1'),
    ('BENCH2', 'BENCH2'),
    ('BENCH3', 'BENCH3'),
    ('BENCH4', 'BENCH4'),
    ('BENCH5', 'BENCH5'),
    ('BENCH6', 'BENCH6'),
    ('BENCH7', 'BENCH7'),
)
POSITIONS = (
    (0, 'QB1'),
    (1, 'RB1'),
    (2, 'RB2'),
    (3, 'WR1'),
    (4, 'WR2'),
    (5, 'TE1'),
    (6, 'FLEX1'),
    (7, 'FLEX2'),
    (8, 'DEF1'),
    (9, 'BENCH1'),
    (10, 'BENCH2'),
    (11, 'BENCH3'),
    (12, 'BENCH4'),
    (13, 'BENCH5'),
    (14, 'BENCH6'),
    (15, 'BENCH7'),
)
# Slot names in board order, derived from BUDGET_POSITIONS; DraftPlan has one
# lowercase field per entry (qb1, rb1, ... bench7).
DRAFT_PLAN_SLOTS = tuple(slot for slot, _ in BUDGET_POSITIONS)

# How deep a slot's shelf of pre-picked alternates goes. Mirrors BACKUP_DEPTH in
# the React app (lib/draft.schemas.ts) — the board's shelf is local-only, but a
# MockDraft's and a DraftPlan's are persisted, and both use these same ranks
# (1..BACKUP_DEPTH, 1 = first alternate).
BACKUP_DEPTH = 3

QB_POSITIONS = ('QB',)
RB_POSITIONS = ('RB',)
WR_POSITIONS = ('WR',)
TE_POSITIONS = ('TE',)
DEF_POSITIONS = ('DEF',)
BENCH_POSITIONS = ('QB', 'RB', 'WR', 'TE', 'DEF')
FLEX_POSITIONS = ('RB', 'WR', 'TE')

ALLOWED_POSITIONS = {
    "QB1": QB_POSITIONS,
    "RB1": RB_POSITIONS,
    "RB2": RB_POSITIONS,
    "WR1": WR_POSITIONS,
    "WR2": WR_POSITIONS,
    "FLEX1": FLEX_POSITIONS,
    "FLEX2": FLEX_POSITIONS,
    "TE1": TE_POSITIONS,
    "DEF1": DEF_POSITIONS,
    "BENCH1": BENCH_POSITIONS,
    "BENCH2": BENCH_POSITIONS,
    "BENCH3": BENCH_POSITIONS,
    "BENCH4": BENCH_POSITIONS,
    "BENCH5": BENCH_POSITIONS,
    "BENCH6": BENCH_POSITIONS,
    "BENCH7": BENCH_POSITIONS,
}


# Shared by the good/bad judgement flags (NFLTeam.coaching_impact,
# Player.defensive_impact). Null means "no view" — no icon is drawn. Only an
# explicit call registers, same tri-state shape as Player.favorite.
IMPACT_CHOICES = (
    ('good', 'Good'),
    ('bad', 'Bad'),
)

TARGET_TYPES = (
    ('prime', 'Prime'),
    ('starter', 'Starter'),
    ('streamer', 'Streamer'),
    ('sleeper', 'Sleeper'),
    ('catalyst', 'Catalyst'),
    ('undraftable', 'Undraftable'),
)

class NFLTeam(models.Model):
    code = models.CharField(max_length=10)
    name = models.CharField(max_length=100, null=True, blank=True)
    short_name = models.CharField(max_length=50, null=True, blank=True)
    year = models.IntegerField(null=True, blank=True)
    # Whether the scheme/staff helps or hurts what their players would otherwise
    # produce. Lives on the TEAM — it's a property of the staff, so setting it
    # once covers every player on the roster. Players read it through
    # `player.team`; null = no view, and no icon is drawn.
    coaching_impact = models.CharField(max_length=10, choices=IMPACT_CHOICES, null=True, blank=True)
    playoff_weather_score = models.IntegerField(default=None, blank=True, null=True)
    playoff_schedule = models.IntegerField(default=None, blank=True, null=True)
    early_season_schedule = models.IntegerField(default=None, blank=True, null=True)
    early_season_qb = models.IntegerField(default=None, blank=True, null=True)
    early_season_wr = models.IntegerField(default=None, blank=True, null=True)
    early_season_rb = models.IntegerField(default=None, blank=True, null=True)
    early_season_te = models.IntegerField(default=None, blank=True, null=True)
    early_season_def = models.IntegerField(default=None, blank=True, null=True)
    playoff_qb = models.IntegerField(default=None, blank=True, null=True)
    playoff_wr = models.IntegerField(default=None, blank=True, null=True)
    playoff_rb = models.IntegerField(default=None, blank=True, null=True)
    playoff_te = models.IntegerField(default=None, blank=True, null=True)
    playoff_def = models.IntegerField(default=None, blank=True, null=True)
    defensive_ranking = models.IntegerField(null=True, blank=True)
    oline_ranking = models.IntegerField(default=0)
    run_ranking = models.IntegerField(default=0)
    pass_ranking = models.IntegerField(default=0)


    def __str__(self):
        return self.code

class Matchup(models.Model):
    year = models.IntegerField()
    week = models.IntegerField()
    home = models.ForeignKey(NFLTeam, on_delete=models.CASCADE, related_name='home_matchup')
    away = models.ForeignKey(NFLTeam, on_delete=models.CASCADE, related_name='away_matchup')

    def __str__(self) -> str:
        return f'{self.home.code} @ {self.away.code}'

    class Meta:
        ordering = ['-year', 'week']

class Player(models.Model):
    player_id = models.IntegerField()
    name = models.CharField(max_length=100)
    position = models.CharField(max_length=100)
    # OVERALL RANK, 1 = the first player off the board. Not round.pick, not an
    # average pick — a dense index over the players the active source ranks,
    # assigned by `apply_adp_source`. It is the one EFFECTIVE ADP: Meta.ordering
    # below, DraftPick.Meta.ordering, add_default_prices and update_position_adp
    # all sort on it.
    #
    # It used to hold FFC's round.pick rendering ("3.05"). That was dropped
    # because the three sources report ADP in three different units — FFC and
    # MFL give an average pick over different draft pools, FantasyPros gives a
    # consensus rank — so the raw numbers on one row could not be compared by
    # eye. Ranking every column makes "FFC 5 / MFL 12 / FPROS 8" mean something.
    adp_formatted = models.PositiveIntegerField()
    projected_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    override_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    # The drafter's WALK-AWAY price: stop bidding above this. Hand-set in /admin,
    # unrelated to the derived prices around it — it's a decision, not a
    # valuation. Shown in the nomination area, coloured against the effective
    # projected price (override_price or projected_price). Null = no view.
    my_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    # Why my_price differs from the projection. Deliberately free text sitting
    # right beside the number in /admin's list, so writing down the reasoning is
    # the path of least resistance — an unexplained variance is usually a gut
    # call that won't survive the room. PREP-TIME ONLY: not serialized, never
    # shown on the board.
    my_price_rationale = models.TextField(null=True, blank=True)
    position_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    adp_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    # --- Multi-source ADP -------------------------------------------------
    # One column per provider, each holding that provider's RANK for this
    # player: a dense 1..N index over the players in THIS database that the
    # provider ranks, ordered by whatever the feed actually reports.
    #
    # Rank rather than the feed's own number because the feeds do not share a
    # unit — FFC and MFL publish an average pick over different draft pools
    # (MFL's look like 7.74), FantasyPros publishes a consensus rank. Storing
    # the sort index makes the columns directly comparable across a row, which
    # is the whole point of having them side by side. The raw feed values are
    # not kept; re-run `sync_adp` to recompute from source.
    #
    # `sync_adp` writes ONLY these columns; it never touches adp_formatted or
    # any price. `apply_adp_source` reads one of them and derives the rest.
    # Null = that provider does not rank this player (coverage differs a lot:
    # FFC ~199, MFL ~205 after dropping IDP, FantasyPros ~210 of a 941-row feed).
    adp_ffc = models.PositiveIntegerField(null=True, blank=True)
    # FantasySharks expert ranks, served through MFL's playerRanks endpoint.
    # This slot used to hold MyFantasyLeague's own ADP; that was removed because
    # MFL's drafter base is ~43% superflex and it has no 1QB filter in any feed,
    # which put 8 QBs in its top 50 against FFC's 1. See providers/sharks.py.
    adp_sharks = models.PositiveIntegerField(null=True, blank=True)
    # FantasyPros ships an expert CONSENSUS RANK, not an average pick — their
    # real ADP endpoint is behind a paid key. Ranked like the others, but don't
    # read it as market data.
    adp_fpros = models.PositiveIntegerField(null=True, blank=True)
    # Provider ids, learned once. `mfl_id` is MyFantasyLeague's player id, still
    # the join key for the FantasySharks ranks (MFL serves them on its own ids).
    # The feeds key on their own ids while this
    # table keys on FFC's (player_id), so the first sync has to resolve by name
    # — fuzzy, and occasionally wrong. Persisting the id it landed on turns
    # every later sync into an exact lookup, so the fuzzy pass only ever sees
    # genuinely new names. See draft/services/adp/matching.py.
    mfl_id = models.CharField(max_length=16, null=True, blank=True, db_index=True)
    fpros_id = models.CharField(max_length=16, null=True, blank=True, db_index=True)
    # Which source produced this row's CURRENT adp_formatted. Empty string
    # means the active source didn't rank them, so their ADP and price are
    # left over from a previous source — the admin filter on this is how you
    # find the gaps a toggle left behind.
    adp_source = models.CharField(max_length=16, null=True, blank=True)
    nickname = models.CharField(max_length=200, null=True, blank=True)
    team = models.ForeignKey(NFLTeam, null=True, blank=True, on_delete=models.SET_NULL)
    year = models.IntegerField(default=2023)
    # Tri-state: True = target, None = neutral, False = actively avoid.
    favorite = models.BooleanField(null=True, blank=True, default=None)
    offensive_support = models.IntegerField(default=0)
    skepticism = models.IntegerField(default=0)
    notes = models.TextField(null=True, blank=True)
    wind_score = models.IntegerField(default=0, help_text="Wind at their back (Off/Def help)")
    bye_week = models.IntegerField(null=True, blank=True)
    watched = models.BooleanField(default=False)
    target_type = models.CharField(max_length=20, choices=TARGET_TYPES, null=True, blank=True)
    # Manual tiering for draft-day targeting: 0 = untiered (the default), 1 = the
    # top tier, ascending. Edited inline in /admin's player list; surfaced by the
    # target_tiers endpoint / the Tiers page.
    target_tier = models.PositiveIntegerField(default=0)
    # Completed NFL seasons. HAND-SET in /admin (no importer touches it), so 0
    # means "rookie OR not yet filled in" — the two aren't distinguishable, which
    # is why the apps' filters treat it as a plain number rather than inferring
    # rookie status from it.
    years_experience = models.PositiveIntegerField(default=0)
    # RISK. Hand-scored 1-10, higher = riskier; 0 = NOT REVIEWED YET (the
    # default), so a zero says nothing about the player. Filtered in /admin and
    # in the board's player list; the summary rides along to the nomination area
    # so the reasoning is on screen while the bidding is live.
    risk_score = models.PositiveIntegerField(
        default=0,
        validators=[MaxValueValidator(10)],
        help_text='1-10, higher = riskier. 0 = not reviewed yet.',
    )
    # The justification for risk_score, written as one BULLET PER LINE (a
    # leading "-", "*" or "•" is optional — the UI strips it). Free text on
    # purpose: the score is what gets filtered, the summary is what gets read.
    risk_summary = models.TextField(null=True, blank=True)
    # Hand-set draft-day warning flags, surfaced as icons in the nomination area
    # (see PLAYER_FLAGS in features/PlayerFlagIcons.tsx) so the drafter doesn't
    # overextend to win a bid. Adding another: field here + admin + the player
    # serializer + the PLAYER_FLAGS table.
    #
    # This player's price is only justified by a PROJECTION — role, opportunity
    # or health — rather than production they have actually put up.
    is_projection = models.BooleanField(default=False)
    # Carrying an injury worth pricing in.
    has_injury = models.BooleanField(default=False)
    # Whether their own team's DEFENSE helps or hurts this player's production.
    # Per-PLAYER, not per-team, because one defense cuts both ways by position: a
    # great defense feeds a back (leads get protected by running clock), while a
    # bad one lifts pass catchers (trailing teams have to air it out). So the
    # call depends on the player, and only a human can make it.
    defensive_impact = models.CharField(max_length=10, choices=IMPACT_CHOICES, null=True, blank=True)
    # NOTE: coaching lives on NFLTeam.coaching_impact, not here — it's a property
    # of the staff, and players read it through `player.team`.

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.projected_price = max(self.projected_price or 0, 1)
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['adp_formatted']
        unique_together = ('player_id', 'year')

class YearlyNotes(models.Model):
    year =  models.IntegerField()
    notes = models.TextField(null=True, blank=True)

class Draft(models.Model):
    year = models.IntegerField()
    draft_name = models.CharField(max_length=100)
    drafter = models.CharField(max_length=100, null=True, blank=True)
    projected_draft = models.TextField(blank=True)
    saved_slots = models.TextField(blank=True)
    locked = models.BooleanField(default=False)
    # Spectator accounts only ever see drafts flagged here (mockups stay
    # hidden); enforced in DraftReadService.get_drafts + IsSpectatorVisible.
    available_to_spectators = models.BooleanField(default=False)
    starting_budget = models.IntegerField(default=200)
    rounds = models.IntegerField(default=19)
    limit_qb = models.IntegerField(default=3)
    limit_rb = models.IntegerField(default=8)
    limit_wr = models.IntegerField(default=8)
    limit_te = models.IntegerField(default=3)
    limit_def = models.IntegerField(default=2)
    date_created = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return '%s' % (self.draft_name)
    
    def save(self, *args, **kwargs):
        if not self.year:
            self.year = timezone.now().year
        super(Draft, self).save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.locked:
            return
        super(Draft, self).delete(*args, **kwargs)

    def add_missing_players(self):
        """Backfill this draft's available-player pool.

        Returns the `Player`s whose rows this call created, so a caller can say
        WHO was added rather than just how many (the admin action lists them).

        A draft's pool is its own `DraftPick` rows (available = `drafted` False),
        written when the draft is created — so a player who enters the DB
        afterwards (a new FFC feed entry, say) has no row here and cannot be
        nominated until this runs. Idempotent: run it after every ADP refresh.

        **Keyed on `(player_id, year)`** — Player's real identity
        (`unique_together`), and the only key stable across the local, Windows
        and hosted copies. The previous version matched on NAME, which broke two
        ways on any DB holding more than one season: two different players
        sharing a name collapsed into one (the second never got a row), and the
        re-lookup dropped the year filter and took `order_by('id').first()`, so
        it attached the OLDEST row of that name — a previous season's player,
        carrying that season's team and price.
        """
        # NB two different things are called player_id here: DraftPick.player_id
        # is the FK column (a Player PK), while Player.player_id is the external
        # FFC id. The identity we dedupe on is the latter, paired with the year.
        already_in_draft = set(
            DraftPick.objects
            .filter(draft=self)
            .values_list('player__player_id', 'player__year')
        )
        missing = [
            player
            for player in Player.objects.filter(year=self.year).exclude(position='K')
            if (player.player_id, player.year) not in already_in_draft
        ]
        if not missing:
            return []

        before_pks = set(
            DraftPick.objects.filter(draft=self).values_list('player_id', flat=True)
        )
        # One INSERT rather than a save() per player (~1,200 on the hosted DB).
        # bulk_create skips DraftPick.save(), whose only job is guarding DRAFTED
        # rows — everything created here is undrafted by definition — and
        # `created`/`last_update_time` still populate through their fields'
        # auto_now hooks. ignore_conflicts keeps this idempotent against the
        # ('draft', 'player') unique constraint even if two runs overlap, which
        # is what the old bare `except` around save() was really doing.
        DraftPick.objects.bulk_create(
            [DraftPick(draft=self, player=player) for player in missing],
            ignore_conflicts=True,
        )
        # Diffed rather than assumed: with ignore_conflicts, `missing` would
        # over-report anything a concurrent run got in first.
        created_pks = set(
            DraftPick.objects.filter(draft=self).values_list('player_id', flat=True)
        ) - before_pks
        return [player for player in missing if player.pk in created_pks]

    def draft_rounds(self):
        """
        Output a list of lists of draft pick objects
        """
        managers = self.managers.all().order_by("position")
        rounds = [[
            {
                "manager": manager.name,
                "manager_position": manager.position,
                "pick": {"name": "No Selection", "price": 0, "position": ""},
                "round": round_number
             } for manager in managers
        ] for round_number in range(self.rounds)]

        current_manager = None
        manager_player_ct = 0
        for pick in self.drafted_players.filter(drafted=True).order_by("manager__position", "-last_update_time"):
            if current_manager != pick.manager:
                current_manager = pick.manager
                manager_player_ct = 0
            round_pick_dict = rounds[manager_player_ct][pick.manager.position]
            round_pick_dict["pick"] = {"name": pick.player.name, "price": pick.price, "position": pick.player.position}
            manager_player_ct += 1

        return rounds


class Manager(models.Model):
    draft = models.ForeignKey(Draft, on_delete=models.CASCADE, null=True, blank=True, related_name='managers')
    name = models.CharField(max_length=100)
    budget = models.FloatField(default=200)
    drafter = models.BooleanField(default=False)
    position = models.IntegerField(default=0)

    class Meta:
        ordering = ('position',)
        verbose_name = 'Manager'
        verbose_name_plural = 'Managers'

    def __str__(self) -> str:
        draft_name = self.draft.draft_name if self.draft else ''
        return '%s - %s - %s' % (draft_name, self.name, self.budget)

    def short_name(self) -> str:
        return self.name

    def long_name(self) -> str:
        return '%s - %s' % (self.draft.draft_name, self.name)
    
    def refresh_budget(self):
        pick_prices = list(int(x) for x in self.manager_players.filter(drafted=True).values_list('price', flat=True))
        spent = sum(pick_prices)
        self.budget = self.draft.starting_budget - spent
        self.save(update_fields=['budget'])

class WatchPick(models.Model):
    draft = models.ForeignKey(Draft, on_delete=models.CASCADE)
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='watched_players')
    manager = models.ForeignKey(Manager, on_delete=models.CASCADE, related_name='watched_players', null=True, blank=True)
    watched = models.BooleanField(default=False)

    class Meta:
        unique_together = ('draft', 'player', 'manager')

    def __str__(self) -> str:

        return '%s - %s' % (self.draft.draft_name, self.player.name)
    
class DraftPick(models.Model):
    draft = models.ForeignKey(Draft, on_delete=models.CASCADE, related_name="drafted_players")
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='drafted_players')
    manager = models.ForeignKey(Manager, on_delete=models.CASCADE, related_name='manager_players', null=True, blank=True)
    price = models.IntegerField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    drafted = models.BooleanField(default=False)
    position_slot = models.CharField(max_length=50, choices=BUDGET_POSITIONS, null=True, blank=True)
    last_update_time = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        unique_together = ('draft', 'player')
        ordering = ('player__adp_formatted',)

    def __str__(self) -> str:
        return self.player.name
        # return '%s - %s - %s - %s' % (self.draft.draft_name, self.manager.name, self.player.name, self.price)

    def save(self, *args, **kwargs):
        self.last_update_time=timezone.now()
        if self.drafted and (not self.manager or not self.price):
            raise Exception(f'Must provide manager ({self.manager}) and price ({self.price}) if player is drafted')
        super(DraftPick, self).save(*args, **kwargs)

    def manager_short_name(self):
        return self.manager.short_name() if self.manager else '-'
    manager_short_name.short_description = 'Manager'

    def projected_price(self):
        return self.player.projected_price

class HistoricalPlayerStats(models.Model):
    player = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True)
    year = models.IntegerField()
    rank = models.IntegerField(null=True, blank=True)
    player_name = models.CharField(max_length=200)
    fantasy_points = models.DecimalField(max_digits=6, decimal_places=2)
    pass_yards = models.DecimalField(max_digits=6, decimal_places=2)
    pass_tds = models.IntegerField()
    rush_att = models.IntegerField()
    rush_yards = models.DecimalField(max_digits=6, decimal_places=2)
    rush_tds = models.IntegerField()
    receptions = models.IntegerField()
    rec_yards = models.DecimalField(max_digits=6, decimal_places=2)
    rec_tds = models.IntegerField()

    class Meta:
        ordering = ['-fantasy_points']

    def __str__(self):
        return '%s - %s' % (self.year, self.player_name)


RESULTS = (
    ('na', 'N/A'),
    ('great', 'Great'),
    ('good', 'Good'),
    ('ok', 'Ok'),
    ('bad', 'Bad'),
    ('injury', 'Injury'),
    ('handcuff', 'Handcuff'),
)
class HistoricalDraftPicks(models.Model):
    year = models.IntegerField()
    manager = models.CharField(max_length=200)
    draft_position = models.IntegerField()
    position = models.CharField(max_length=10)
    player = models.CharField(max_length=200)
    price = models.IntegerField()
    result = models.CharField(max_length=200, choices=RESULTS, default=RESULTS[0][0], null=True)
    historical_stat = models.ForeignKey(HistoricalPlayerStats, on_delete=models.SET_NULL, null=True)

    class Meta():
        ordering = ('year', 'manager', '-price',)

    def __str__(self):
        return '%s - %s' % (self.year, self.player)

    def is_qb(self):
        return self.position == 'QB'

    def was_success(self):
        return self.result in RESULTS[1:2]

    @property
    def fantasy_points(self):
        return self.historical_stat.fantasy_price if self.historical_stat else ''

BUDGET_STATUSES = (
    ('none', 'None'),
    ('budgeted', 'Budgeted'),
    ('drafted', 'Drafted')
)
class BudgetPlayer(models.Model):
    draft = models.ForeignKey(Draft, on_delete=models.CASCADE, related_name="budgeted_players")
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='budgeted_players')
    manager = models.ForeignKey(Manager, on_delete=models.CASCADE, related_name="budgeted_players", null=True, blank=True)
    price = models.IntegerField(null=True, blank=True)
    position = models.CharField(max_length=50, choices=BUDGET_POSITIONS, null=True, blank=True)
    status = models.CharField(max_length=50, choices=BUDGET_STATUSES, default='none')

    def __str__(self):
        return '%s - %s - %s' % (self.player.name, self.position, self.price)


class DraftPlan(models.Model):
    """A standalone roster plan — one player per draft slot — not tied to any
    draft or user, so any draft (owner) can pull it in as a budget template."""
    name = models.CharField(max_length=100)
    year = models.IntegerField()
    qb1 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    rb1 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    rb2 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    wr1 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    wr2 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    te1 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    flex1 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    flex2 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    def1 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    bench1 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    bench2 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    bench3 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    bench4 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    bench5 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    bench6 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    bench7 = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    date_created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-year', 'name')
        # A plan is addressed by year + name everywhere it's saved ("Save as
        # plan" from a mock or a draft), so the pair is the identity: saving the
        # same name again OVERWRITES that plan rather than growing a duplicate.
        unique_together = (('year', 'name'),)

    def __str__(self):
        return '%s - %s' % (self.year, self.name)

    def slot_players(self):
        """Slot name -> Player (or None), in board order."""
        return {slot: getattr(self, slot.lower()) for slot in DRAFT_PLAN_SLOTS}

    def slot_backups(self):
        """Slot name -> [DraftPlanBackup | None] * BACKUP_DEPTH, in board order."""
        return _shelves_by_slot(self.backups.all())


def _shelves_by_slot(rows):
    """Group backup rows into a fixed-length shelf per slot, indexed by rank-1.

    Shared by DraftPlan and MockDraft: both hold one row per (slot, rank) cell
    and both hand the client every slot, filled or not.
    """
    shelves = {slot: [None] * BACKUP_DEPTH for slot in DRAFT_PLAN_SLOTS}
    for row in rows:
        shelf = shelves.get(row.position_slot)
        if shelf and 1 <= row.rank <= BACKUP_DEPTH:
            shelf[row.rank - 1] = row
    return shelves


class DraftPlanBackup(models.Model):
    """One pre-picked alternate on a saved plan: the player to fall back to for
    `position_slot` if the plan's pick there is gone, at depth `rank`.

    A backup is a candidate, not a commitment, so it carries no price (applying
    prices from override/projected like the plan's own slots do) and the same
    player may sit on several slots' shelves (a handcuff RB backing RB1 and RB2).
    """
    plan = models.ForeignKey(DraftPlan, on_delete=models.CASCADE, related_name='backups')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='plan_backups')
    position_slot = models.CharField(max_length=50, choices=BUDGET_POSITIONS)
    rank = models.IntegerField()

    class Meta:
        ordering = ('position_slot', 'rank')
        unique_together = (
            ('plan', 'position_slot', 'rank'),
            ('plan', 'position_slot', 'player'),
        )

    def __str__(self):
        return '%s B%s - %s' % (self.position_slot, self.rank, self.player.name)


class MockDraft(models.Model):
    """A one-roster practice draft: the 16 canonical slots, a player and a price
    in each, and nothing else — no managers, no opponents, no per-player
    DraftPick rows.

    It exists because sketching a roster shape used to mean creating a whole
    empty Draft (which fans out a DraftPick per player) just to snapshot it as a
    DraftPlan. A MockDraft is that sketch on its own: fill slots from the player
    list, watch the budget, then save it as a plan
    (`DraftPlanWriteService.create_from_mock_draft`).

    Deliberately NOT tied to a Draft or a user, for the same reason DraftPlan
    isn't — any draft can end up pulling in the plan it produces.
    """
    name = models.CharField(max_length=100)
    year = models.IntegerField()
    starting_budget = models.IntegerField(default=200)
    # The M2M is the through model below; it's declared so `mock.players` reads
    # naturally, but every write goes through MockPick (slot + price live there).
    players = models.ManyToManyField(Player, through='MockPick', related_name='mock_drafts')
    date_created = models.DateTimeField(auto_now_add=True)
    last_update_time = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-year', '-date_created', 'name')

    def __str__(self):
        return '%s - %s' % (self.year, self.name)

    def save(self, *args, **kwargs):
        if not self.year:
            self.year = timezone.now().year
        super().save(*args, **kwargs)

    def slot_picks(self):
        """Slot name -> MockPick (or None), in board order."""
        picks_by_slot = {pick.position_slot: pick for pick in self.picks.all()}
        return {slot: picks_by_slot.get(slot) for slot in DRAFT_PLAN_SLOTS}

    def slot_backups(self):
        """Slot name -> [MockBackup | None] * BACKUP_DEPTH, in board order.

        Deliberately absent from budget_spent: an alternate is a candidate, not
        a commitment, same as the board's local shelf.
        """
        return _shelves_by_slot(self.backups.all())

    @property
    def budget_spent(self):
        return sum(pick.price or 0 for pick in self.picks.all())

    @property
    def budget_remaining(self):
        return self.starting_budget - self.budget_spent


class MockPick(models.Model):
    """One filled slot of a MockDraft — the through row of MockDraft.players.

    Unique BOTH ways: one player per slot, and one slot per player (so moving a
    player updates their row instead of duplicating them).
    """
    mock_draft = models.ForeignKey(MockDraft, on_delete=models.CASCADE, related_name='picks')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='mock_picks')
    position_slot = models.CharField(max_length=50, choices=BUDGET_POSITIONS)
    price = models.IntegerField(default=0)
    last_update_time = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (
            ('mock_draft', 'position_slot'),
            ('mock_draft', 'player'),
        )

    def __str__(self):
        return '%s - %s - %s' % (self.position_slot, self.player.name, self.price)


class MockBackup(models.Model):
    """One cell of a MockDraft's backup shelf — the alternate for
    `position_slot` at depth `rank`.

    This is where a plan's backups are AUTHORED (the draft board's own shelf
    stays local to the browser); `create_from_mock_draft` copies these into
    DraftPlanBackup. Like the plan's, it's priceless and per-cell: one row per
    (slot, rank), and a player may hold cells on several slots' shelves.
    """
    mock_draft = models.ForeignKey(MockDraft, on_delete=models.CASCADE, related_name='backups')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='mock_backups')
    position_slot = models.CharField(max_length=50, choices=BUDGET_POSITIONS)
    rank = models.IntegerField()
    last_update_time = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('position_slot', 'rank')
        unique_together = (
            ('mock_draft', 'position_slot', 'rank'),
            ('mock_draft', 'position_slot', 'player'),
        )

    def __str__(self):
        return '%s B%s - %s' % (self.position_slot, self.rank, self.player.name)


class PlayerStats(models.Model):
    year = models.IntegerField()
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='player_stats')
    type = models.CharField(max_length=100, choices=(("rushing", "Rushing"), ("receiving", "Receiving"), ("passing", "Passing")))
    age = models.IntegerField(null=True)
    games = models.IntegerField(null=True)
    games_started = models.IntegerField(null=True)
    rush_attempts = models.IntegerField(null=True)
    rush_yards = models.IntegerField(null=True)
    targets = models.IntegerField(null=True)
    receptions = models.IntegerField(null=True)
    receiving_yards = models.IntegerField(null=True)
    tds = models.IntegerField(null=True)
    first_downs = models.IntegerField(null=True)


class PositionADP(models.Model):
    position = models.CharField(max_length=3)
    adp = models.IntegerField()
    average_price = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        ordering = ('position', 'adp')

    def __str__(self):
        return '%s - %s' % (self.position, self.adp)


class PlanChange(models.Model):
    draft = models.ForeignKey(Draft, on_delete=models.CASCADE)
    budget_pick = models.ForeignKey(BudgetPlayer, on_delete=models.CASCADE)
    draft_pick = models.ForeignKey(DraftPick, on_delete=models.CASCADE)
    position = models.CharField(max_length=50, choices=BUDGET_POSITIONS, null=True, blank=True)

    class Meta:
        unique_together = ('draft', 'position')

    def __str__(self):
        return '%s - %s - %s - %s' % (self.draft.draft_name, self.position, self.budget_pick, self.draft_pick)


class AdpSourceSync(models.Model):
    """One row per (ADP source, year): when it was last pulled, how well it
    matched, and whether it is the source currently driving the board.

    Exists because a column of numbers on Player says nothing about how much to
    trust it. Before toggling the effective source you want to know when it was
    synced, how big the provider's sample was, and — most of all — how many
    players it FAILED to match, since an unmatched star silently keeps its old
    price. `unmatched_names` carries the list so the admin can print it.

    `is_active` lives here rather than in a settings singleton so the toggle
    sits next to the freshness metadata that justifies it. Exactly one row per
    year should be active; `apply_source` enforces that.
    """

    source = models.CharField(max_length=16)
    year = models.IntegerField()
    synced_at = models.DateTimeField(auto_now=True)
    feed_rows = models.IntegerField(default=0)
    matched = models.IntegerField(default=0)
    # Matched by name similarity rather than an exact hit — the number worth
    # eyeballing, because this is where a wrong player gets someone's ADP.
    fuzzy_matched = models.IntegerField(default=0)
    unmatched = models.IntegerField(default=0)
    unmatched_names = models.TextField(blank=True, default='')
    # The provider's own sample size: MFL reports drafts, FantasyPros reports
    # experts. Units differ by source, which is why it's a plain number with no
    # unit baked in — the admin labels it per source.
    sample_size = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=False)

    class Meta:
        unique_together = ('source', 'year')
        ordering = ('-year', 'source')

    def __str__(self):
        return '%s %s%s' % (self.source, self.year, ' (active)' if self.is_active else '')


class AdpPlayerAlias(models.Model):
    """A HAND-MADE link from a provider's spelling of a name to a Player.

    The matcher resolves most rows on its own, and what it can't resolve is
    usually a player this DB simply doesn't carry — no alias can fix that, only
    an FFC refresh that creates the row. This table is for the remaining case:
    the player IS here, and a feed spells them differently enough that neither
    normalisation nor similarity connects the two.

    Consulted immediately after a cached provider id and BEFORE any automatic
    matching, so a human decision always beats the algorithm — including
    overriding a fuzzy match that landed on the wrong player, which is the more
    dangerous failure and the one an alias most needs to be able to correct.

    `source` blank means "every source", which is usually right: feeds tend to
    disagree with this DB the same way. Set it only to fix one provider.
    """

    # Blank = applies to every source.
    source = models.CharField(max_length=16, blank=True, default='')
    # The name exactly as the feed sends it, kept verbatim for readability.
    # Lookups normalise both sides, so punctuation and case don't matter.
    feed_name = models.CharField(max_length=100)
    position = models.CharField(max_length=10)
    player = models.ForeignKey('Player', on_delete=models.CASCADE,
                               related_name='adp_aliases')
    note = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        unique_together = ('source', 'feed_name', 'position')
        ordering = ('feed_name',)
        verbose_name_plural = 'ADP player aliases'

    def __str__(self):
        scope = self.source or 'all sources'
        return '%s (%s) -> %s [%s]' % (self.feed_name, self.position, self.player.name, scope)

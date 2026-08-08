import logging

from django.utils import timezone
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
    adp_formatted = models.DecimalField(max_digits=8, decimal_places=2)
    projected_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    override_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    position_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    adp_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
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
        player_names = list(Player.objects.filter(year=self.year).exclude(position='K').values_list('name', flat=True))
        pick_names = list(DraftPick.objects.filter(draft=self).values_list('player__name', flat=True))
        missing_players = []
        for player_name in player_names:
            if player_name not in pick_names:
                added_player = Player.objects.filter(name=player_name).order_by('id').first()
                missing_players.append(added_player)
        players_to_add = []
        for player_to_add in missing_players:
            dp = DraftPick(
                draft=self,
                player=player_to_add
            )
            try:
                dp.save()
            except Exception as exc:
                logger.error(f"could not save {dp.player.id} {dp.player.name}")

        DraftPick.objects.bulk_create(players_to_add)

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

    def __str__(self):
        return '%s - %s' % (self.year, self.name)

    def slot_players(self):
        """Slot name -> Player (or None), in board order."""
        return {slot: getattr(self, slot.lower()) for slot in DRAFT_PLAN_SLOTS}


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

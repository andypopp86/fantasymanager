from functools import cached_property
from django.utils import timezone
from django.db import models
from django.db.models import Case, Value, When, F

POSITIONS = (
    (0, 'QB1'),
    (1, 'RB1'),
    (2, 'RB2'),
    (3, 'WR1'),
    (4, 'WR2'),
    (5, 'FLEX1'),
    (6, 'FLEX2'),
    (7, 'TE1'),
    (8, 'DEF1'),
    (9, 'BENCH1'),
    (10, 'BENCH2'),
    (11, 'BENCH3'),
    (12, 'BENCH4'),
    (13, 'BENCH5'),
    (14, 'BENCH6'),
    (15, 'BENCH7'),
)
POSITIONS_MAP = {
    'QB1': 0,
    'RB1': 1,
    'RB2': 2,
    'WR1': 3,
    'WR2': 4,
    'FLEX1': 5,
    'FLEX2': 6,
    'TE1': 7,
    'DEF1': 8,
    'BENCH1': 9,
    'BENCH2': 10,
    'BENCH3': 11,
    'BENCH4': 12,
    'BENCH5': 13,
    'BENCH6': 14,
    'BENCH7': 15,
}

FLEX_POSITIONS = ('RB', 'WR', 'TE')

class NFLTeam(models.Model):
    code = models.CharField(max_length=10)
    name = models.CharField(max_length=100, null=True, blank=True)
    short_name = models.CharField(max_length=50, null=True, blank=True)
    year = models.IntegerField(null=True, blank=True)
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
    player_id = models.CharField(max_length=100)
    name = models.CharField(max_length=100)
    position = models.CharField(max_length=100)
    adp_formatted = models.DecimalField(max_digits=8, decimal_places=2)
    projected_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    override_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    nickname = models.CharField(max_length=200, null=True, blank=True)
    team = models.ForeignKey(NFLTeam, null=True, blank=True, on_delete=models.SET_NULL)
    year = models.IntegerField(default=2023)
    favorite = models.BooleanField(default=False)
    offensive_support = models.IntegerField(default=0)
    skepticism = models.IntegerField(default=0)

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.projected_price = max(self.projected_price, 1)
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
    starting_budget = models.IntegerField(default=200)
    limit_qb = models.IntegerField(default=3)
    limit_rb = models.IntegerField(default=8)
    limit_wr = models.IntegerField(default=8)
    limit_te = models.IntegerField(default=3)
    limit_def = models.IntegerField(default=2)

    def __str__(self) -> str:
        return '%s' % (self.draft_name)
    
    def save(self, *args, **kwargs):
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
                print(f"could not save {dp.player.id} {dp.player.name}")

        DraftPick.objects.bulk_create(players_to_add)


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
    
    @cached_property
    def current_team(self):
        picks = self.manager_players.filter(drafted=True)
        picks = picks.annotate(pos_order=Case(
            When(player__position='QB', then=Value(1)),
            When(player__position='RB', then=Value(2)),
            When(player__position='WR', then=Value(3)),
            When(player__position='TE', then=Value(4)),
            When(player__position='DEF', then=Value(5)),
            default=Value(6),
        )).order_by(F('pos_order'), '-price')
        team_slots = {x[1]:{'slot': x[0], 'pick': None} for x in POSITIONS}
        loop_ct = 0
        filled_slot = None

        MAX_ITERS = 200
        for pick in picks:
            position = str(pick.player.position)
            applied = False
            slot_num = 1
            slot_value = None
            while not applied and loop_ct < MAX_ITERS:
                loop_ct += 1
                slot_pos = '%s%s' % (position, slot_num)
                slot_dict = team_slots.get(slot_pos, -1)
                slot_value = slot_dict['pick'] if slot_dict != -1 else -1
                if slot_num == 8:
                    applied = True # skip to next pick
                    slot_dict['source'] = 'drafted'
                    continue
                elif slot_value is None:
                    team_slots[slot_pos]['pick'] = pick
                    applied = True
                    filled_slot = str(slot_pos)
                elif slot_value == -1 and pick.player.position in ('RB', 'WR', 'TE') and 'FLEX' not in slot_pos:
                    position = 'FLEX'
                    slot_num = 1
                elif slot_value == -1 and pick.player.position in ('RB', 'WR', 'TE') and 'FLEX' in slot_pos:
                    position = 'BENCH'
                    slot_num = 1
                else:
                    slot_num += 1

        open_position_slots = set()
        for slot, slot_dict in team_slots.items():
            if slot_dict['pick'] is None:
                open_position_slots.add(slot[:-1])
        return team_slots, open_position_slots, filled_slot

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
    position_slot = models.CharField(max_length=50, choices=POSITIONS, null=True, blank=True)
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
            raise Exception('Must provide manager and price if player is drafted')
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
    position = models.CharField(max_length=50, choices=POSITIONS)
    status = models.CharField(max_length=50, choices=BUDGET_STATUSES, default='none')

    def __str__(self):
        return '%s - %s - %s' % (self.player.name, self.position, self.price)
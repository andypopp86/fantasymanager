from django.contrib import admin
from django.db.models import Q
from django.forms import Textarea
from draft import models as d

class SuccessFilter(admin.SimpleListFilter):
    title = 'Success'
    parameter_name = 'success'

    def lookups(self, request, model_admin):
        # picks = set([d.result for d in model_admin.model.objects.all()])
        return [('True', 'True'), ('False', 'False')]

    def queryset(self, request, queryset):
        if self.value() == 'True':
            return queryset.filter(result__in=['good', 'great'])
        elif self.value() == 'False':
            return queryset.filter(result__in=['ok', 'bad', 'injury', 'handcuff'])
        else:
            return queryset

class FlexFilter(admin.SimpleListFilter):
    title = 'Is Flex'
    parameter_name = 'flex'

    def lookups(self, request, model_admin):
        # picks = set([d.result for d in model_admin.model.objects.all()])
        return [('True', 'True'), ('False', 'False')]

    def queryset(self, request, queryset):
        if self.value() == 'True':
            return queryset.filter(position__in=['WR', 'RB', 'TE', 'Flex'])
        elif self.value() == 'False':
            return queryset.filter(position__in=['QB', 'Def'])
        else:
            return queryset


class PlayerAdmin(admin.ModelAdmin):
    # Working order: what you set during prep first, reference columns last.
    list_display = ('name', 'position', 'team', 'year', 'target_tier', 'is_projection', 'has_injury', 'defensive_impact', 'projected_price', 'my_price', 'my_price_rationale', 'adp_formatted', 'favorite', 'override_price', 'player_id')
    # `name` is the link column, pinned explicitly. Django otherwise links
    # list_display[0], which is no longer player_id — and a link column may
    # never be list_editable, so leaving it implicit would break the moment the
    # first column becomes an editable one.
    list_display_links = ('name',)
    # Edit tiers and the warning flags straight from the list — setting these a
    # board's worth of players one change-form at a time is unworkable.
    list_editable = ('target_tier', 'is_projection', 'has_injury', 'defensive_impact', 'favorite', 'override_price', 'my_price', 'my_price_rationale')
    search_fields = ('name', 'position', )
    # `team` last on purpose — it renders every team as a link, so leading with
    # it pushes the short, frequently-used filters below the fold.
    list_filter = ('position', 'year', 'target_tier', 'is_projection', 'has_injury', 'defensive_impact', 'favorite', 'team')

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        # A default TextField renders as a 10-row textarea, which blows the
        # changelist rows apart. Shrunk per-FIELD rather than via
        # formfield_overrides, which would catch `notes` too — that one wants the
        # room, since it holds multi-line bullets.
        if db_field.name == 'my_price_rationale':
            kwargs['widget'] = Textarea(attrs={'rows': 2, 'cols': 28})
        return super().formfield_for_dbfield(db_field, request, **kwargs)
    fields = ('name', 'position', 'team', 'year', 'notes', 'target_tier', 'is_projection', 'has_injury', 'defensive_impact', 'projected_price', 'adp_price', 'my_price', 'my_price_rationale', 'skepticism', 'adp_formatted', 'favorite', 'override_price', 'player_id', )
    
class DraftAdmin(admin.ModelAdmin):
    list_display = ('draft_name', 'year', 'drafter', 'projected_draft', 'available_to_spectators', 'date_created')
    list_editable = ('available_to_spectators',)
    # search_fields = ('draft_name', 'drafter', )
    list_filter = ('locked', 'available_to_spectators', 'draft_name', 'drafter',)
    fields = ('draft_name', 'year', 'drafter', 'projected_draft', 'saved_slots', 'locked', 'available_to_spectators', 'date_created' )
    # date_created is auto_now_add (non-editable); without this the edit form
    # 500s with FieldError.
    readonly_fields = ('date_created',)

class PositionADPAdmin(admin.ModelAdmin):
    list_display = ('position', 'adp', 'average_price')
    list_filter = ('position', 'adp',)
    fields = ('position', 'adp', 'average_price')

class ManagerAdmin(admin.ModelAdmin):
    list_display = ('draft', 'name', 'budget', 'drafter', 'position', )
    # search_fields = ('draft_name', 'drafter', )
    list_filter = ('draft', 'name',)
    fields = ('draft', 'name', 'budget', 'drafter', 'position', )

class DraftPickAdmin(admin.ModelAdmin):
    list_display = ('draft', 'player', 'manager_short_name', 'get_position_slot_display', 'price', 'projected_price', 'last_update_time')
    search_fields = ('draft__draft_name', 'player__name', 'manager__name')
    list_filter = ('draft__draft_name', 'manager', 'player', 'position_slot')
    fieldsets = (
        ('Draft', {
            'fields': (
                ('draft', 'player', 'drafted', 'position_slot'),
            )
        }),
        ('Manager', {
            'fields': (
                ('manager', 'price'),
            )
        }),
        ('Meta', {
            'fields': (
                ('created',),
            )
        }),
    )
    readonly_fields = ('created',)

class WatchPickAdmin(admin.ModelAdmin):
    list_display = ('draft', 'player', 'manager', 'watched')
    list_filter = ('draft', 'player', 'manager', 'watched')
    readonly_fields = ('draft', 'player', 'manager', )

class HistoricalDraftPickAdmin(admin.ModelAdmin):
    list_display = ('year', 'manager', 'player', 'position', 'price', 'result', )
    list_filter = ('year','result', 'position', SuccessFilter, FlexFilter, 'manager',  'player', )
    search_fields = ('year', 'manager', 'player', 'price', 'result')
    fieldsets = (
        ('Draft', {
            'fields': (
                ('year', 'manager', 'draft_position', 'player', 'price', 'result'),
            )
        }),
        # ('Manager', {
        #     'fields': (
        #         ('manager', 'price'),
        #     )
        # }),
        # ('Meta', {
        #     'fields': (
        #         ('created',),
        #     )
        # }),
    )
class HistoricalPlayerStatsAdmin(admin.ModelAdmin):
    list_display = ('year', 'player', 'player_name', 'fantasy_points','rank', 'pass_yards','pass_tds','rush_att','rush_yards','rush_tds','receptions','rec_yards','rec_tds')
    list_filter = ('year', 'player_name', 'rank')
    search_fields = ('player_name', )
    fields = ('year', 'player', 'fantasy_points','rank', 'pass_yards','pass_tds','rush_att','rush_yards','rush_tds','receptions','rec_yards','rec_tds')

class BudgetPlayerAdmin(admin.ModelAdmin):
    list_display = ('draft', 'player', 'manager', 'price', 'position', 'status_display')
    list_filter = ('draft', 'manager', 'status')
    readonly_fields = ('draft', 'player', 'manager', 'price' )

    @admin.display(description='Status')
    def status_display(self, obj):
        return obj.get_status_display()

class DraftPlanAdmin(admin.ModelAdmin):
    list_display = ('name', 'year', 'date_created')
    list_filter = ('year',)
    search_fields = ('name',)

class NFLTeamAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'year', 'coaching_impact', 'playoff_weather_score', 'early_season_schedule', 'playoff_schedule', 'defensive_ranking', 'pass_ranking', 'run_ranking')
    # Set the staff's impact straight from the team list — 32 rows, one pass.
    list_editable = ('coaching_impact',)
    list_filter = ('code', 'year', 'coaching_impact',)
    fields = ('code', 'name', 'year', 'coaching_impact', 'playoff_weather_score', 
              'early_season_schedule', 'early_season_qb', 'early_season_rb', 'early_season_wr', 'early_season_te', 'early_season_def',
              'defensive_ranking', 'oline_ranking', 'pass_ranking', 'run_ranking')
    readonly_fields = ('year',)

class TeamMatchupFilter(admin.SimpleListFilter):
    title = 'Team'
    parameter_name = 'team'

    def lookups(self, request, model_admin):
        teams = list([(d.code, d.name) for d in d.NFLTeam.objects.distinct('code')])
        return teams

    def queryset(self, request, queryset):
        if not self.value():
            return queryset
        else:
            return queryset.filter(Q(home__code=self.value()) | Q(away__code=self.value()))
        
class MatchupAdmin(admin.ModelAdmin):
    list_display = ('year', 'week', 'home', 'away')
    list_filter = ('year', 'week', TeamMatchupFilter)
    readonly_fields = ('year', 'week', 'home', 'away')


class PlayerStatsAdmin(admin.ModelAdmin):
    search_fields = ('player__name',)
    list_display = ('player', 'year', 'age', 'games', 'games_started', 'rush_attempts', 'rush_yards', 'targets', 'receptions', 'receiving_yards', 'tds', 'first_downs')
    list_filter = ('year', 'player')
    fields = ('player', 'year', 'age', 'games', 'games_started', 'rush_attempts', 'rush_yards', 'targets', 'receptions', 'receiving_yards', 'tds', 'first_downs')


class PlanChangeAdmin(admin.ModelAdmin):
    list_display = ('draft', 'budget_pick', 'draft_pick', 'position')
    # list_filter = ('draft', 'budget_pick', 'draft_pick', 'position')
    fields = ('draft', 'budget_pick', 'draft_pick', 'position')


admin.site.register(d.NFLTeam, NFLTeamAdmin)
admin.site.register(d.Player, PlayerAdmin)
admin.site.register(d.Manager, ManagerAdmin)
admin.site.register(d.Draft, DraftAdmin)
admin.site.register(d.DraftPick, DraftPickAdmin)
admin.site.register(d.WatchPick, WatchPickAdmin)
admin.site.register(d.Matchup, MatchupAdmin)
admin.site.register(d.BudgetPlayer, BudgetPlayerAdmin)
admin.site.register(d.DraftPlan, DraftPlanAdmin)
admin.site.register(d.HistoricalDraftPicks, HistoricalDraftPickAdmin)
admin.site.register(d.HistoricalPlayerStats, HistoricalPlayerStatsAdmin)
admin.site.register(d.PlayerStats, PlayerStatsAdmin)
admin.site.register(d.PositionADP, PositionADPAdmin)
admin.site.register(d.PlanChange, PlanChangeAdmin)

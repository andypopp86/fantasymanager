from django.contrib import admin
from django.db.models import Q
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
            print(self.value())
            return queryset


class PlayerAdmin(admin.ModelAdmin):
    list_display = ('player_id', 'year', 'name', 'team', 'nickname',  'position',  'adp_formatted',  'projected_price',  'override_price')
    search_fields = ('name', 'position', )
    list_filter = ('position', 'year')
    fields = ('player_id', 'team', 'year',  'name', 'nickname', 'position',  'adp_formatted',  'projected_price',  'override_price', 'skepticism')
    
class DraftAdmin(admin.ModelAdmin):
    list_display = ('draft_name', 'year', 'drafter', 'projected_draft', )
    # search_fields = ('draft_name', 'drafter', )
    list_filter = ('draft_name', 'drafter',)
    fields = ('draft_name', 'year', 'drafter', 'projected_draft', 'saved_slots', 'locked' )
    
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
    readonly_fields = ('created', 'position_slot')

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
    list_display = ('draft', 'player', 'manager', 'price', 'get_position_display', 'get_status_display')
    list_filter = ('draft', 'manager', 'status')
    readonly_fields = ('draft', 'player', 'manager', 'price' )

class NFLTeamAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'year', 'playoff_weather_score', 'early_season_schedule', 'playoff_schedule', 'defensive_ranking', 'pass_ranking', 'run_ranking')
    list_filter = ('code', 'year',)
    fields = ('code', 'name', 'year', 'playoff_weather_score', 
              'early_season_schedule', 'early_season_qb', 'early_season_rb', 'early_season_wr', 'early_season_te', 'early_season_def',
              'defensive_ranking', 'oline_ranking', 'pass_ranking', 'run_ranking')
    readonly_fields = ('code', 'year',)

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




admin.site.register(d.NFLTeam, NFLTeamAdmin)
admin.site.register(d.Player, PlayerAdmin)
admin.site.register(d.Manager, ManagerAdmin)
admin.site.register(d.Draft, DraftAdmin)
admin.site.register(d.DraftPick, DraftPickAdmin)
admin.site.register(d.WatchPick, WatchPickAdmin)
admin.site.register(d.Matchup, MatchupAdmin)
admin.site.register(d.BudgetPlayer, BudgetPlayerAdmin)
admin.site.register(d.HistoricalDraftPicks, HistoricalDraftPickAdmin)
admin.site.register(d.HistoricalPlayerStats, HistoricalPlayerStatsAdmin)

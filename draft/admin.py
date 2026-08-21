from django.contrib import admin, messages
from django.db.models import Case, F, Q, When
from django.forms import Textarea
from django.template.response import TemplateResponse
from django.utils import timezone
from draft import models as d
from draft.services.draft.adp_refresh import refresh_and_sync

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


class MyPriceVarianceFilter(admin.SimpleListFilter):
    """Where the drafter's walk-away price sits against the projection.

    Compares my_price to `override_price or projected_price` — the same
    effective price the board colours against, NOT the raw projected_price
    column, which would mis-bucket every player carrying an override. Players
    with no my_price can't be compared, so they only appear under "Not set".
    """
    title = 'My price vs projected'
    parameter_name = 'my_price_var'

    def lookups(self, request, model_admin):
        return [
            ('above', 'Above projected'),
            ('below', 'Below projected'),
            ('equal', 'Equal'),
            ('unset', 'Not set'),
        ]

    def queryset(self, request, queryset):
        value = self.value()
        if not value:
            return queryset
        if value == 'unset':
            return queryset.filter(my_price__isnull=True)
        priced = queryset.filter(my_price__isnull=False).annotate(
            _effective_price=Case(
                When(override_price__isnull=False, then=F('override_price')),
                default=F('projected_price'),
            )
        )
        if value == 'above':
            return priced.filter(my_price__gt=F('_effective_price'))
        if value == 'below':
            return priced.filter(my_price__lt=F('_effective_price'))
        return priced.filter(my_price=F('_effective_price'))


class PlayerTeamFilter(admin.SimpleListFilter):
    """Filter players by team CODE, not by the team FK.

    NFLTeam is one row per (code, year) — the attributes change season to season
    — so the stock `team` filter lists ARI, ARI, ARI… with nothing on screen to
    tell the years apart, and picking the wrong one silently returns nobody. The
    CODE is the stable identity: ARI is Arizona in every season. Pair this with
    the Year filter when a single season is what you want.
    """
    title = 'Team'
    parameter_name = 'team_code'

    def lookups(self, request, model_admin):
        codes = (d.NFLTeam.objects
                 .exclude(code__isnull=True).exclude(code='')
                 .order_by('code').values_list('code', flat=True).distinct())
        return [(code, code) for code in codes]

    def queryset(self, request, queryset):
        if not self.value():
            return queryset
        return queryset.filter(team__code=self.value())


class RiskBandFilter(admin.SimpleListFilter):
    """risk_score in BANDS, next to the exact-value `risk_score` filter.

    The board's player list filters risk as a mode + value pair (=, <=, >=);
    admin filters are discrete choices, so the same intent becomes bands here.
    "Not reviewed" is its own entry because 0 is the default, not a low score —
    and the same reason the <=N band starts at 1: a ceiling that swallowed every
    unscored player would return the whole board.
    """
    title = 'Risk band'
    parameter_name = 'risk_band'

    BANDS = [
        ('unreviewed', 'Not reviewed (0)', (0, 0)),
        ('reviewed', 'Reviewed (1-10)', (1, 10)),
        ('low', 'Low (1-3)', (1, 3)),
        ('medium', 'Medium (4-6)', (4, 6)),
        ('high', 'High (7-8)', (7, 8)),
        ('extreme', 'Extreme (9-10)', (9, 10)),
    ]

    def lookups(self, request, model_admin):
        return [(slug, label) for slug, label, _ in self.BANDS]

    def queryset(self, request, queryset):
        for slug, _, (low, high) in self.BANDS:
            if self.value() == slug:
                return queryset.filter(risk_score__gte=low, risk_score__lte=high)
        return queryset


class PlayerAdmin(admin.ModelAdmin):
    # Working order: what you set during prep first, reference columns last.
    list_display = ('name', 'position', 'team', 'year', 'target_tier', 'years_experience', 'risk_score', 'risk_summary', 'is_projection', 'has_injury', 'defensive_impact', 'projected_price', 'my_price', 'my_price_rationale', 'adp_formatted', 'favorite', 'override_price', 'player_id')
    # `name` is the link column, pinned explicitly. Django otherwise links
    # list_display[0], which is no longer player_id — and a link column may
    # never be list_editable, so leaving it implicit would break the moment the
    # first column becomes an editable one.
    list_display_links = ('name',)
    # Edit tiers and the warning flags straight from the list — setting these a
    # board's worth of players one change-form at a time is unworkable.
    list_editable = ('target_tier', 'years_experience', 'risk_score', 'risk_summary', 'is_projection', 'has_injury', 'defensive_impact', 'favorite', 'override_price', 'my_price', 'my_price_rationale')
    # 20 rows per page, not the 100 default. The list is an inline EDITING
    # surface, so page size sets how many form fields a Save posts (11 editable
    # fields + pk + action checkbox per row) — and a screenful you can actually
    # scan beats one you scroll past while tiering.
    list_per_page = 20
    search_fields = ('name', 'position', )
    # The change form is long (prices, flags, tiers, risk); putting the submit
    # row at the top too saves scrolling to the bottom to commit one edit.
    # NOTE: this is the CHANGE FORM only — Django has no equivalent for the
    # changelist's inline-edit Save, which stays at the bottom of the list.
    save_on_top = True
    # Team last on purpose — it renders every code as a link, so leading with it
    # pushes the short, frequently-used filters below the fold.
    list_filter = ('position', 'year', 'target_tier', 'years_experience', 'risk_score', RiskBandFilter, 'is_projection', 'has_injury', 'defensive_impact', 'favorite', MyPriceVarianceFilter, PlayerTeamFilter)

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        # A default TextField renders as a 10-row textarea, which blows the
        # changelist rows apart. Shrunk per-FIELD rather than via
        # formfield_overrides, which would catch `notes` too — that one wants the
        # room, since it holds multi-line bullets.
        if db_field.name == 'my_price_rationale':
            kwargs['widget'] = Textarea(attrs={'rows': 2, 'cols': 28})
        # Scored and justified in the same pass, so the summary is editable in
        # the list too — taller than the rationale box because it holds bullets.
        if db_field.name == 'risk_summary':
            kwargs['widget'] = Textarea(attrs={'rows': 4, 'cols': 34})
        return super().formfield_for_dbfield(db_field, request, **kwargs)
    fields = ('name', 'position', 'team', 'year', 'notes', 'target_tier', 'years_experience', 'risk_score', 'risk_summary', 'is_projection', 'has_injury', 'defensive_impact', 'projected_price', 'adp_price', 'my_price', 'my_price_rationale', 'skepticism', 'adp_formatted', 'favorite', 'override_price', 'player_id', )
    
class DraftAdmin(admin.ModelAdmin):
    list_display = ('draft_name', 'year', 'drafter', 'projected_draft', 'available_to_spectators', 'date_created')
    list_editable = ('available_to_spectators',)
    # search_fields = ('draft_name', 'drafter', )
    list_filter = ('locked', 'available_to_spectators', 'draft_name', 'drafter',)
    fields = ('draft_name', 'year', 'drafter', 'projected_draft', 'saved_slots', 'locked', 'available_to_spectators', 'date_created' )
    # date_created is auto_now_add (non-editable); without this the edit form
    # 500s with FieldError.
    readonly_fields = ('date_created',)
    actions = ('refresh_adp_and_sync_players', 'add_missing_players')

    # A draft's available-player pool is its own DraftPick rows, fixed at
    # creation — so players added to the DB later (an ADP refresh picking up new
    # FFC entries) are invisible to a draft already in flight and can't be
    # nominated. This is the way to pull them in: select the draft, run the
    # action. Safe to re-run; it only ever adds.
    # Refreshing ADP belongs to no single row — but syncing a draft's pool
    # afterwards does, and that is the step worth checking, so the draft IS the
    # row and this is an action rather than a changelist button. Runs INLINE in
    # the request (no worker process, no queue): one staff user, a handful of
    # times a season, against an import whose every step is idempotent, so a
    # timeout costs a retry and nothing else. See the Dockerfile's --timeout.
    @admin.action(description='Refresh ADP + prices, then sync the selected draft')
    def refresh_adp_and_sync_players(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(
                request,
                "Pick exactly one draft — step 4 syncs one draft's player pool.",
                messages.ERROR,
            )
            return None

        draft = queryset.get()
        if not request.POST.get('confirmed'):
            # Nothing has run yet. The refresh rewrites every projected price
            # for the year, so it gets the admin's own confirm-page treatment.
            return TemplateResponse(request, 'admin/draft/refresh_adp_confirm.html', {
                **self.admin_site.each_context(request),
                'title': 'Refresh ADP and sync players',
                'draft': draft,
                'current_year': timezone.now().year,
            })

        report = refresh_and_sync(draft)
        # The page carries the lists; this message survives navigating away.
        self.message_user(
            request,
            f'{draft.draft_name}: {len(report.summary.created)} player(s) created, '
            f'{len(report.picks_added)} pick row(s) added.',
            messages.SUCCESS,
        )
        return TemplateResponse(request, 'admin/draft/refresh_adp_result.html', {
            **self.admin_site.each_context(request),
            'title': 'Refresh ADP and sync players',
            'report': report,
        })

    @admin.action(description='Add missing players to the selected drafts')
    def add_missing_players(self, request, queryset):
        # One message per draft, naming the players it pulled in — after an ADP
        # refresh that's a handful and worth reading. Capped because a first run
        # on an old draft can add four figures, and admin messages ride in a
        # cookie before falling back to the session.
        NAME_CAP = 50
        for draft in queryset:
            created = draft.add_missing_players()
            if not created:
                self.message_user(
                    request,
                    f'{draft.draft_name}: no missing players — every {draft.year} player already has a pick row.',
                    messages.INFO,
                )
                continue
            names = sorted(f'{player.name} ({player.position})' for player in created)
            overflow = len(names) - NAME_CAP
            self.message_user(
                request,
                f'{draft.draft_name}: added {len(created)} player(s) — '
                + ', '.join(names[:NAME_CAP])
                + (f', and {overflow} more' if overflow > 0 else ''),
                messages.SUCCESS,
            )

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

class MockPickInline(admin.TabularInline):
    model = d.MockPick
    extra = 0
    autocomplete_fields = ('player',)


class MockDraftAdmin(admin.ModelAdmin):
    list_display = ('name', 'year', 'starting_budget', 'budget_spent', 'filled_slots', 'last_update_time')
    list_filter = ('year',)
    search_fields = ('name',)
    inlines = (MockPickInline,)

    @admin.display(description='Slots filled')
    def filled_slots(self, obj):
        return obj.picks.count()


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
admin.site.register(d.MockDraft, MockDraftAdmin)
admin.site.register(d.HistoricalDraftPicks, HistoricalDraftPickAdmin)
admin.site.register(d.HistoricalPlayerStats, HistoricalPlayerStatsAdmin)
admin.site.register(d.PlayerStats, PlayerStatsAdmin)
admin.site.register(d.PositionADP, PositionADPAdmin)
admin.site.register(d.PlanChange, PlanChangeAdmin)

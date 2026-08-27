from django.contrib import admin, messages
from django.db.models import Case, F, Q, When
from django.forms import Textarea
from django.template.response import TemplateResponse
from django.urls import path
from django.utils import timezone
from draft import models as d
from draft.services.adp.apply import PRICE_BASIS_CHOICES, apply_source, source_status
from draft.services.adp.sources import SOURCE_KEYS
from draft.services.adp.sync import sync_source
from draft.services.draft.adp_refresh import capture_draft_warnings, refresh_and_sync

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
    list_display = ('name', 'position', 'team', 'year', 'target_tier', 'years_experience', 'risk_score', 'risk_summary', 'is_projection', 'has_injury', 'defensive_impact', 'projected_price', 'my_price', 'my_price_rationale', 'adp_formatted', 'adp_source', 'adp_ffc', 'adp_mfl', 'adp_fpros', 'favorite', 'override_price', 'player_id')
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
    # Adds the "Refresh ADP + prices" button to the changelist's object-tools.
    change_list_template = 'admin/draft/player/change_list.html'
    # Derived by sync_adp / apply_adp_source, so hand-edits would be silently
    # overwritten by the next run. Readable in the change form, never editable.
    readonly_fields = ('adp_source', 'adp_ffc', 'adp_mfl', 'adp_fpros')

    def get_urls(self):
        # BEFORE super(), or the admin's catch-all <path:object_id>/ route
        # swallows these and tries to open a player with that pk.
        return [
            path(
                'refresh-adp/',
                # admin_view() is what gates this on a logged-in staff user and
                # adds the never-cache headers; a bare view here would be open.
                self.admin_site.admin_view(self.refresh_adp_view),
                name='draft_player_refresh_adp',
            ),
            path(
                'sync-adp/',
                self.admin_site.admin_view(self.sync_adp_view),
                name='draft_player_sync_adp',
            ),
            path(
                'apply-adp/',
                self.admin_site.admin_view(self.apply_adp_view),
                name='draft_player_apply_adp',
            ),
        ] + super().get_urls()

    # Lives on the PLAYER changelist because that is whose data it rewrites: a
    # whole year of ADP and projected prices, not one row. Syncing a draft's
    # pick pool afterwards is the only per-draft part, so the draft is a FIELD
    # on the confirm page (and optional) rather than a row you select to reach a
    # global refresh.
    #
    # Runs INLINE in the request — no worker, no queue. One staff user a few
    # times a season, against an import whose every step is idempotent, so a
    # timeout costs a retry. See the Dockerfile's gunicorn --timeout.
    def refresh_adp_view(self, request):
        current_year = timezone.now().year
        context = {
            **self.admin_site.each_context(request),
            'title': 'Refresh ADP and prices',
            'current_year': current_year,
            'opts': self.model._meta,
        }
        if request.method != 'POST':
            # GET is the confirmation page: step 2 rewrites every projected
            # price for the year, so nothing runs until it's submitted.
            context['drafts'] = d.Draft.objects.filter(year=current_year).order_by('draft_name')
            return TemplateResponse(request, 'admin/draft/refresh_adp_confirm.html', context)

        draft = None
        if request.POST.get('draft'):
            draft = d.Draft.objects.filter(pk=request.POST['draft']).first()
        report = refresh_and_sync(draft)
        # The page carries the lists; this message survives navigating away.
        self.message_user(
            request,
            f'{len(report.summary.created)} player(s) created'
            + (f', {len(report.picks_added)} pick row(s) added to {report.draft_name}.'
               if report.synced_a_draft else ' (no draft synced).'),
            messages.SUCCESS,
        )
        context['report'] = report
        return TemplateResponse(request, 'admin/draft/refresh_adp_result.html', context)

    # --- Multi-source ADP ------------------------------------------------
    # Two buttons rather than one, because the two halves have very different
    # risk profiles and that should be visible in the UI. Syncing only fills
    # per-source columns and cannot change what the board shows, so it is safe
    # at any time; applying rewrites every ADP and price for the year. Pairing
    # them behind one button would drag the safe half down to the dangerous
    # half's confirmation burden — and the entire point of storing every source
    # is that the second half needs no network call and is freely reversible.

    def sync_adp_view(self, request):
        current_year = timezone.now().year
        context = {
            **self.admin_site.each_context(request),
            'title': 'Sync ADP sources',
            'current_year': current_year,
            'opts': self.model._meta,
        }
        if request.method != 'POST':
            context['statuses'] = source_status(current_year)
            return TemplateResponse(request, 'admin/draft/sync_adp_confirm.html', context)

        # Unknown keys are dropped rather than 400'd: the checkboxes are the
        # only thing that produces them, so anything else is a hand-crafted POST.
        chosen = [key for key in request.POST.getlist('sources') if key in SOURCE_KEYS]
        if not chosen:
            self.message_user(request, 'No sources selected - nothing was synced.',
                              messages.WARNING)
            context['statuses'] = source_status(current_year)
            return TemplateResponse(request, 'admin/draft/sync_adp_confirm.html', context)

        # Fuzzy matches log at WARNING, so this is how "we guessed at this
        # player" reaches the page instead of only the container's stdout.
        with capture_draft_warnings() as collector:
            summaries = [sync_source(key, year=current_year) for key in chosen]

        matched = sum(s.matched for s in summaries if s.ok)
        failed = [s.label for s in summaries if not s.ok]
        self.message_user(
            request,
            f'Synced {len(summaries) - len(failed)} source(s), {matched} player ADPs written.'
            + (f' FAILED: {", ".join(failed)}.' if failed else ''),
            messages.WARNING if failed else messages.SUCCESS,
        )
        context['summaries'] = summaries
        context['warnings'] = collector.records
        return TemplateResponse(request, 'admin/draft/sync_adp_result.html', context)

    def apply_adp_view(self, request):
        current_year = timezone.now().year
        context = {
            **self.admin_site.each_context(request),
            'title': 'Apply ADP source',
            'current_year': current_year,
            'opts': self.model._meta,
            'price_bases': PRICE_BASIS_CHOICES,
        }
        if request.method != 'POST':
            context['statuses'] = source_status(current_year)
            return TemplateResponse(request, 'admin/draft/apply_adp_confirm.html', context)

        source = request.POST.get('source')
        if source not in SOURCE_KEYS:
            self.message_user(request, 'Pick a source to apply.', messages.WARNING)
            context['statuses'] = source_status(current_year)
            return TemplateResponse(request, 'admin/draft/apply_adp_confirm.html', context)

        basis = request.POST.get('price_basis')
        if basis not in PRICE_BASIS_CHOICES:
            basis = 'historical'

        with capture_draft_warnings() as collector:
            report = apply_source(source, year=current_year, price_basis=basis)

        self.message_user(
            request,
            f'{report.label} is now the effective ADP for {current_year}: '
            f'{report.ranked} player(s) re-derived, {report.unranked} left untouched.',
            messages.SUCCESS,
        )
        context['report'] = report
        context['warnings'] = collector.records
        return TemplateResponse(request, 'admin/draft/apply_adp_result.html', context)

    # Team last on purpose — it renders every code as a link, so leading with it
    # pushes the short, frequently-used filters below the fold.
    list_filter = ('position', 'year', 'target_tier', 'years_experience', 'risk_score', RiskBandFilter, 'is_projection', 'has_injury', 'defensive_impact', 'favorite', 'adp_source', MyPriceVarianceFilter, PlayerTeamFilter)

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
    fields = ('name', 'position', 'team', 'year', 'notes', 'target_tier', 'years_experience', 'risk_score', 'risk_summary', 'is_projection', 'has_injury', 'defensive_impact', 'projected_price', 'adp_price', 'my_price', 'my_price_rationale', 'skepticism', 'adp_formatted', 'adp_source', 'adp_ffc', 'adp_mfl', 'adp_fpros', 'favorite', 'override_price', 'player_id', )
    
class DraftAdmin(admin.ModelAdmin):
    list_display = ('draft_name', 'year', 'drafter', 'projected_draft', 'available_to_spectators', 'date_created')
    list_editable = ('available_to_spectators',)
    # search_fields = ('draft_name', 'drafter', )
    list_filter = ('locked', 'available_to_spectators', 'draft_name', 'drafter',)
    fields = ('draft_name', 'year', 'drafter', 'projected_draft', 'saved_slots', 'locked', 'available_to_spectators', 'date_created' )
    # date_created is auto_now_add (non-editable); without this the edit form
    # 500s with FieldError.
    readonly_fields = ('date_created',)
    actions = ('add_missing_players',)

    # A draft's available-player pool is its own DraftPick rows, fixed at
    # creation — so players added to the DB later (an ADP refresh picking up new
    # FFC entries) are invisible to a draft already in flight and can't be
    # nominated. This is the way to pull them in: select the draft, run the
    # action. Safe to re-run; it only ever adds.
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


class AdpSourceSyncAdmin(admin.ModelAdmin):
    """Read-only-ish view of when each ADP source was last pulled and how well
    it matched. `is_active` is shown but not editable here: flipping the boolean
    would mark a source active WITHOUT re-deriving adp_formatted or prices, so
    the record would claim something the Player rows don't reflect. Use the
    "Apply ADP source" button on the player changelist, which does both."""

    list_display = ('source', 'year', 'synced_at', 'feed_rows', 'matched',
                    'fuzzy_matched', 'unmatched', 'sample_size', 'is_active')
    list_filter = ('source', 'year', 'is_active')
    readonly_fields = ('source', 'year', 'synced_at', 'feed_rows', 'matched',
                       'fuzzy_matched', 'unmatched', 'unmatched_names',
                       'sample_size', 'is_active')

    def has_add_permission(self, request):
        return False


admin.site.register(d.AdpSourceSync, AdpSourceSyncAdmin)


class AdpPlayerAliasAdmin(admin.ModelAdmin):
    """Hand-made feed-name -> Player links.

    Reached from the "unmatched" list on the Sync ADP result page, which links
    here with the name, position and source prefilled — the only ergonomic way
    to work through a list of misses.

    Worth knowing before using it: most unmatched rows are NOT spelling
    problems, they are players this DB does not carry (rookies, and anyone added
    to a feed since the last FFC refresh). An alias cannot conjure a Player row.
    If the name has no counterpart here, run "Refresh ADP + prices" instead —
    that is the only thing that creates players.
    """

    list_display = ('feed_name', 'position', 'player', 'source', 'note')
    list_filter = ('source', 'position')
    search_fields = ('feed_name', 'player__name')
    autocomplete_fields = ('player',)
    fields = ('feed_name', 'position', 'player', 'source', 'note')

    def get_changeform_initial_data(self, request):
        # Prefilled by the links on the sync result page.
        return {
            'feed_name': request.GET.get('feed_name', ''),
            'position': request.GET.get('position', ''),
            'source': request.GET.get('source', ''),
        }


admin.site.register(d.AdpPlayerAlias, AdpPlayerAliasAdmin)

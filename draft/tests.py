import os
import tempfile
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from draft.models import DRAFT_PLAN_SLOTS, Draft, DraftPick, DraftPlan, Manager, MockDraft, Player
from draft.services.draft.draft_plan import DraftPlanWriteService
from draft.services.draft.mock_draft import MockDraftReadService, MockDraftWriteService


def make_drafter_user():
    return get_user_model().objects.create_user(
        email="drafter@test.com", password="pw", is_staff=True,
    )


def make_spectator_user():
    return get_user_model().objects.create_user(
        email="friend@test.com", password="pw",
    )


def make_player(name, position, year=2026, player_id=None):
    return Player.objects.create(
        player_id=player_id or Player.objects.count() + 1,
        name=name,
        position=position,
        adp_formatted=1.0,
        projected_price=10,
        year=year,
    )


class DraftPlanTests(TestCase):

    def setUp(self):
        self.draft = Draft.objects.create(year=2026, draft_name="mock one")
        self.drafter = Manager.objects.create(draft=self.draft, name="me", drafter=True, position=0)
        self.opponent = Manager.objects.create(draft=self.draft, name="them", drafter=False, position=1)
        self.qb = make_player("Test QB", "QB")
        self.rb = make_player("Test RB", "RB")
        self.other_rb = make_player("Other RB", "RB")

    def draft_player(self, player, manager, slot, price=10):
        return DraftPick.objects.create(
            draft=self.draft, player=player, manager=manager,
            price=price, drafted=True, position_slot=slot,
        )

    def test_create_from_draft_copies_drafter_slots(self):
        self.draft_player(self.qb, self.drafter, "QB1")
        self.draft_player(self.rb, self.drafter, "RB1")

        plan = DraftPlanWriteService(user=None).create_from_draft(self.draft.id, name="plan a")

        self.assertEqual(plan.year, 2026)
        self.assertEqual(plan.qb1, self.qb)
        self.assertEqual(plan.rb1, self.rb)
        self.assertIsNone(plan.rb2)

    def test_create_from_draft_ignores_opponents_and_undrafted(self):
        self.draft_player(self.rb, self.opponent, "RB1")
        DraftPick.objects.create(draft=self.draft, player=self.other_rb, drafted=False)

        plan = DraftPlanWriteService(user=None).create_from_draft(self.draft.id, name="plan b")

        self.assertIsNone(plan.rb1)

    def test_slot_players_covers_every_slot(self):
        plan = DraftPlan.objects.create(name="empty", year=2026)
        self.assertEqual(tuple(plan.slot_players().keys()), DRAFT_PLAN_SLOTS)

    def test_plan_survives_draft_deletion(self):
        self.draft_player(self.qb, self.drafter, "QB1")
        plan = DraftPlanWriteService(user=None).create_from_draft(self.draft.id, name="keeper")

        self.draft.delete()

        plan.refresh_from_db()
        self.assertEqual(plan.qb1, self.qb)


class DraftPlanAPITests(TestCase):

    def setUp(self):
        self.client.force_login(make_drafter_user())
        self.draft = Draft.objects.create(year=2026, draft_name="mock api")
        self.drafter = Manager.objects.create(draft=self.draft, name="me", drafter=True, position=0)
        self.qb = make_player("API QB", "QB")
        DraftPick.objects.create(
            draft=self.draft, player=self.qb, manager=self.drafter,
            price=25, drafted=True, position_slot="QB1",
        )

    def test_create_list_detail_roundtrip(self):
        created = self.client.post(
            f"/api/drafts/draft/{self.draft.id}/create_plan/",
            {"params": {"name": "plan a"}},
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["slots"]["QB1"]["name"], "API QB")
        self.assertIsNone(created.data["slots"]["RB1"])

        listed = self.client.get("/api/drafts/draft/plans/", {"year": 2026})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data), 1)

        detail = self.client.get(f"/api/drafts/draft/plans/{created.data['id']}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["name"], "plan a")

    def test_delete_plan(self):
        plan = DraftPlan.objects.create(name="doomed", year=2026)
        response = self.client.post(f"/api/drafts/draft/plans/{plan.id}/delete/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(DraftPlan.objects.filter(id=plan.id).exists())


class ApiAuthorizationTests(TestCase):
    """The two-tier permission model: anonymous → nothing, spectator
    (non-staff) → board reads only, and only on drafts flagged
    available_to_spectators; drafter (staff) → everything."""

    def setUp(self):
        self.draft = Draft.objects.create(
            year=2026, draft_name="authz", available_to_spectators=True)
        self.hidden_draft = Draft.objects.create(year=2026, draft_name="mockup")
        self.spectator = make_spectator_user()

    def test_anonymous_is_rejected_everywhere(self):
        self.assertEqual(
            self.client.get(f"/api/drafts/draft/{self.draft.id}/detail/").status_code, 403)
        self.assertEqual(
            self.client.post(f"/api/drafts/draft/delete/{self.draft.id}/").status_code, 403)

    def test_spectator_can_read_board_endpoints(self):
        self.client.force_login(self.spectator)
        self.assertEqual(
            self.client.get(f"/api/drafts/draft/{self.draft.id}/detail/").status_code, 200)
        self.assertEqual(
            self.client.get(f"/api/drafts/draft/{self.draft.id}/manager_picks/").status_code, 200)
        self.assertEqual(self.client.get("/api/drafts/draft/drafts").status_code, 200)
        self.assertEqual(self.client.get("/api/me/").status_code, 200)

    def test_spectator_blocked_from_drafter_endpoints(self):
        self.client.force_login(self.spectator)
        self.assertEqual(
            self.client.get(f"/api/drafts/draft/{self.draft.id}/available_players/").status_code, 403)
        self.assertEqual(
            self.client.get(f"/api/drafts/draft/{self.draft.id}/budgeted_picks/").status_code, 403)
        self.assertEqual(self.client.get("/api/drafts/draft/plans/").status_code, 403)
        self.assertEqual(
            self.client.post(f"/api/drafts/draft/delete/{self.draft.id}/").status_code, 403)

    def test_spectator_cannot_see_unflagged_drafts(self):
        self.client.force_login(self.spectator)
        listed = self.client.get("/api/drafts/draft/drafts")
        self.assertEqual(
            [row["draft_name"] for row in listed.data], ["authz"])
        self.assertEqual(
            self.client.get(f"/api/drafts/draft/{self.hidden_draft.id}/detail/").status_code, 403)
        self.assertEqual(
            self.client.get(f"/api/drafts/draft/{self.hidden_draft.id}/manager_picks/").status_code, 403)

    def test_superuser_sync_endpoints_require_superuser(self):
        for user in (self.spectator, make_drafter_user()):
            self.client.force_login(user)
            self.assertEqual(
                self.client.get("/api/drafts/draft/spectator/drafts/").status_code, 403)
            self.assertEqual(
                self.client.get(f"/api/drafts/draft/spectator/{self.draft.id}/drafted_players/").status_code, 403)

    def test_superuser_sync_endpoints(self):
        superuser = get_user_model().objects.create_superuser(
            email="admin2@test.com", password="pw")
        self.client.force_login(superuser)
        listed = self.client.get("/api/drafts/draft/spectator/drafts/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([row["draft_name"] for row in listed.data], ["authz"])
        picks = self.client.get(f"/api/drafts/draft/spectator/{self.draft.id}/drafted_players/")
        self.assertEqual(picks.status_code, 200)
        self.assertEqual(picks.data, [])
        self.assertEqual(
            self.client.get("/api/drafts/draft/spectator/999999/drafted_players/").status_code, 404)
        # unflagged drafts (mockups) 404 even for superusers
        self.assertEqual(
            self.client.get(f"/api/drafts/draft/spectator/{self.hidden_draft.id}/drafted_players/").status_code, 404)

    def test_create_draft_with_spectator_flag(self):
        self.client.force_login(make_drafter_user())
        response = self.client.post(
            "/api/drafts/draft/create/",
            {"params": {"draft_name": "real one", "managers": "me*\nthem",
                        "starting_budget": 200, "limit_qb": 3, "limit_rb": 8,
                        "limit_wr": 8, "limit_te": 3, "limit_def": 2,
                        "available_to_spectators": True}},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["available_to_spectators"])
        self.assertTrue(
            Draft.objects.get(id=response.data["id"]).available_to_spectators)

    def test_staff_sees_all_drafts(self):
        self.client.force_login(make_drafter_user())
        listed = self.client.get("/api/drafts/draft/drafts")
        self.assertEqual(
            {row["draft_name"] for row in listed.data}, {"authz", "mockup"})
        self.assertEqual(
            self.client.get(f"/api/drafts/draft/{self.hidden_draft.id}/detail/").status_code, 200)

    def test_spa_entrypoint_requires_login(self):
        response = self.client.get("/app/")
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith("/login/"))
        self.client.force_login(self.spectator)
        self.assertEqual(self.client.get("/app/").status_code, 200)


class RelinkPlayerTeamsTests(TestCase):
    """relink_player_teams_for_current_year repoints players stuck on
    another season's NFLTeam row (old unfiltered lookup / off-feed players)
    at the current year's row for the same code."""

    def test_relinks_stale_year_and_leaves_current_alone(self):
        from django.core.management import call_command
        from django.utils import timezone
        from draft.models import NFLTeam

        this_year = timezone.now().year
        old_kc = NFLTeam.objects.create(code="KC", year=this_year - 3)
        new_det = NFLTeam.objects.create(code="DET", year=this_year)

        stale = make_player("Stale Link", "TE")
        stale.team = old_kc
        stale.save(update_fields=["team"])
        current = make_player("Current Link", "RB")
        current.team = new_det
        current.save(update_fields=["team"])
        teamless = make_player("No Team", "DEF")

        call_command("relink_player_teams_for_current_year")

        stale.refresh_from_db(); current.refresh_from_db(); teamless.refresh_from_db()
        # relinked to a this-year KC row (created on the fly by get_or_create_team)
        self.assertEqual(stale.team.code, "KC")
        self.assertEqual(stale.team.year, this_year)
        self.assertEqual(current.team_id, new_det.id)
        self.assertIsNone(teamless.team)


class BudgetedPicksActualPriceTests(TestCase):
    """Budgeted slots report the real winning price once the player is
    drafted. Regression: actual_prices was keyed by Player pk but looked up
    by the FFC player_id — different id spaces, so actual_price was always 0
    and the budget kept showing projections."""

    def test_drafted_budget_pick_reports_actual_price(self):
        from draft.models import BudgetPlayer
        from draft.services.draft.draft import DraftReadService

        draft = Draft.objects.create(year=2026, draft_name="budget actuals")
        manager = Manager.objects.create(draft=draft, name="me", drafter=True, position=0)
        player = make_player("Deal Player", "RB")
        player.projected_price = 70
        player.save(update_fields=["projected_price"])

        BudgetPlayer.objects.create(
            draft=draft, player=player, manager=manager,
            price=70, position="RB1", status="budgeted")
        DraftPick.objects.create(
            draft=draft, player=player, manager=manager,
            price=60, drafted=True, position_slot="RB1")

        picks = DraftReadService(user=None).get_budgeted_picks(draft_id=draft.id)
        self.assertEqual(picks["RB1"]["pick"]["actual_price"], 60)
        self.assertEqual(int(picks["RB1"]["pick"]["projected_price"]), 70)


class TargetTierTests(TestCase):
    """Target tiers group UNDRAFTED players by Player.target_tier, best tier
    first. Untiered (0) players are excluded, and availability is read from
    this draft's DraftPicks, not from the Player row."""

    def setUp(self):
        from draft.services.draft.draft import DraftReadService
        self.service = DraftReadService(user=None)
        self.draft = Draft.objects.create(year=2026, draft_name="tiers")
        self.manager = Manager.objects.create(draft=self.draft, name="me", drafter=True, position=0)

    def add_pick(self, player, tier, drafted=False):
        player.target_tier = tier
        player.save(update_fields=["target_tier"])
        return DraftPick.objects.create(
            draft=self.draft, player=player,
            manager=self.manager if drafted else None,
            price=10 if drafted else None,
            drafted=drafted, position_slot="RB1" if drafted else None,
        )

    def test_groups_undrafted_players_by_tier(self):
        top = make_player("Top RB", "RB")
        second = make_player("Second WR", "WR")
        self.add_pick(top, 1)
        self.add_pick(second, 2)

        tiers = self.service.get_target_tiers(draft_id=self.draft.id)

        self.assertEqual([tier["tier"] for tier in tiers], [1, 2])
        self.assertEqual([pick.player for pick in tiers[0]["picks"]], [top])
        self.assertEqual([pick.player for pick in tiers[1]["picks"]], [second])

    def test_excludes_untiered_and_drafted_players(self):
        untiered = make_player("Untiered RB", "RB")
        gone = make_player("Gone RB", "RB")
        available = make_player("Available RB", "RB")
        self.add_pick(untiered, 0)
        self.add_pick(gone, 1, drafted=True)
        self.add_pick(available, 1)

        tiers = self.service.get_target_tiers(draft_id=self.draft.id)

        self.assertEqual(len(tiers), 1)
        self.assertEqual([pick.player for pick in tiers[0]["picks"]], [available])

    def test_tier_players_order_by_price_descending(self):
        cheap = make_player("Cheap RB", "RB")
        pricey = make_player("Pricey RB", "RB")
        pricey.projected_price = 50
        pricey.save(update_fields=["projected_price"])
        # override_price wins over projected_price in the ordering annotation.
        overridden = make_player("Overridden RB", "RB")
        overridden.override_price = 70
        overridden.save(update_fields=["override_price"])
        for player in (cheap, pricey, overridden):
            self.add_pick(player, 1)

        tiers = self.service.get_target_tiers(draft_id=self.draft.id)

        self.assertEqual(
            [pick.player for pick in tiers[0]["picks"]],
            [overridden, pricey, cheap],
        )


class PlayerProjectionFlagTests(TestCase):
    """is_projection drives the nomination-area warning, and it only gets there
    through a hand-written serializer — the kind of passthrough where a field
    goes missing silently and the warning just never fires."""

    def test_defaults_to_false(self):
        self.assertFalse(make_player("New RB", "RB").is_projection)

    def test_available_players_carries_every_flag(self):
        from draft.api.views.draft import DraftPicksOutputSerializer
        from draft.services.draft.draft import DraftReadService

        from draft.models import NFLTeam

        draft = Draft.objects.create(year=2026, draft_name="projections")
        # Coaching lives on the TEAM and is read through player.team, so the
        # nested team serializer has to carry it too.
        bad_staff = NFLTeam.objects.create(code="BAD", year=2026, coaching_impact="bad")
        good_staff = NFLTeam.objects.create(code="GUD", year=2026, coaching_impact="good")

        risky = make_player("Projection RB", "RB")
        Player.objects.filter(pk=risky.pk).update(
            is_projection=True, has_injury=True, defensive_impact="good", team=bad_staff)
        proven = make_player("Proven WR", "WR")
        Player.objects.filter(pk=proven.pk).update(defensive_impact="bad", team=good_staff)
        # No team at all must not blow up the lookup — it just draws no icon.
        neutral = make_player("Neutral TE", "TE")
        for player in (risky, proven, neutral):
            DraftPick.objects.create(draft=draft, player=player, drafted=False)

        picks = DraftReadService(user=None).get_available_players(draft_id=draft.id)
        rows = {
            row["player"]["name"]: row["player"]
            for row in (DraftPicksOutputSerializer.serialize(pick) for pick in picks)
        }
        # The same defense can help one player and hurt another, which is why
        # defensive_impact is per-player while coaching_impact is per-team.
        self.assertEqual(
            [rows["Projection RB"][f] for f in ("is_projection", "has_injury", "defensive_impact")],
            [True, True, "good"])
        self.assertEqual(rows["Projection RB"]["team"]["coaching_impact"], "bad")
        self.assertEqual(
            [rows["Proven WR"][f] for f in ("is_projection", "has_injury", "defensive_impact")],
            [False, False, "bad"])
        self.assertEqual(rows["Proven WR"]["team"]["coaching_impact"], "good")
        # No view serializes as null (draws no icon), and no team at all is fine.
        self.assertIsNone(rows["Neutral TE"]["defensive_impact"])
        self.assertIsNone(rows["Neutral TE"]["team"])

    def test_my_price_is_exposed_but_its_rationale_is_not(self):
        """my_price drives the nomination-area figure, so it has to survive the
        serializer. Its rationale is prep-time reasoning for /admin only and must
        NOT reach the board."""
        from draft.api.views.draft import DraftPicksOutputSerializer
        from draft.services.draft.draft import DraftReadService

        draft = Draft.objects.create(year=2026, draft_name="my price")
        player = make_player("Priced RB", "RB")
        Player.objects.filter(pk=player.pk).update(
            my_price=41, my_price_rationale="thin depth chart behind him")
        unpriced = make_player("Unpriced WR", "WR")
        DraftPick.objects.create(draft=draft, player=player, drafted=False)
        DraftPick.objects.create(draft=draft, player=unpriced, drafted=False)

        picks = DraftReadService(user=None).get_available_players(draft_id=draft.id)
        rows = {
            row["player"]["name"]: row["player"]
            for row in (DraftPicksOutputSerializer.serialize(pick) for pick in picks)
        }
        self.assertEqual(int(float(rows["Priced RB"]["my_price"])), 41)
        # No view serializes as null, which renders nothing.
        self.assertIsNone(rows["Unpriced WR"]["my_price"])
        self.assertNotIn("my_price_rationale", rows["Priced RB"])


class YearsExperienceTests(TestCase):
    """Hand-set field whose only job is to be filtered on, in both apps — so
    what's worth asserting is that it survives the two hand-written serializers
    that carry it there."""

    def test_defaults_to_zero(self):
        self.assertEqual(make_player("Rookie RB", "RB").years_experience, 0)

    def test_available_players_carries_it(self):
        from draft.api.views.draft import DraftPicksOutputSerializer
        from draft.services.draft.draft import DraftReadService

        draft = Draft.objects.create(year=2026, draft_name="experience")
        vet = make_player("Vet WR", "WR")
        Player.objects.filter(pk=vet.pk).update(years_experience=7)
        rookie = make_player("Rook WR", "WR")
        for player in (vet, rookie):
            DraftPick.objects.create(draft=draft, player=player, drafted=False)

        picks = DraftReadService(user=None).get_available_players(draft_id=draft.id)
        rows = {
            row["player"]["name"]: row["player"]
            for row in (DraftPicksOutputSerializer.serialize(pick) for pick in picks)
        }
        self.assertEqual(rows["Vet WR"]["years_experience"], 7)
        self.assertEqual(rows["Rook WR"]["years_experience"], 0)

    def test_mock_draft_players_carry_it(self):
        from draft.api.views.mock_draft import MockDraftPlayerOutputSerializer
        from draft.services.draft.mock_draft import MockDraftReadService

        mock = MockDraft.objects.create(name="experience", year=2026)
        vet = make_player("Mock Vet TE", "TE")
        Player.objects.filter(pk=vet.pk).update(years_experience=4)

        players = MockDraftReadService(user=None).get_available_players(mock.id)
        rows = {
            row["name"]: row
            for row in (MockDraftPlayerOutputSerializer.serialize(player) for player in players)
        }
        self.assertEqual(rows["Mock Vet TE"]["years_experience"], 4)


class AddMissingPlayersTests(TestCase):
    """`Draft.add_missing_players` backfills the draft's available pool, keyed on
    (player_id, year). The identity key is the whole point of the method, so
    that's what these assert — plus the two ways the old name-matching failed.
    """

    def setUp(self):
        self.draft = Draft.objects.create(year=2026, draft_name="pool")
        self.existing = make_player("Already In", "RB")
        DraftPick.objects.create(draft=self.draft, player=self.existing, drafted=False)

    def test_adds_only_players_missing_for_the_drafts_year(self):
        new_player = make_player("Brand New", "WR")
        make_player("Wrong Year", "WR", year=2025)

        created = self.draft.add_missing_players()

        self.assertEqual([player.pk for player in created], [new_player.pk])
        self.assertEqual(
            set(DraftPick.objects.filter(draft=self.draft).values_list('player__name', flat=True)),
            {"Already In", "Brand New"},
        )

    def test_excludes_kickers(self):
        make_player("Kick Er", "K")
        self.assertEqual(self.draft.add_missing_players(), [])

    def test_is_idempotent(self):
        make_player("Brand New", "WR")
        self.assertEqual(len(self.draft.add_missing_players()), 1)
        # Second run has nothing left to do, and doesn't duplicate the first.
        self.assertEqual(self.draft.add_missing_players(), [])
        self.assertEqual(DraftPick.objects.filter(draft=self.draft).count(), 2)

    def test_previous_season_row_of_the_same_name_is_neither_reused_nor_blocking(self):
        """The old version matched on NAME: it looked the player up without a
        year filter and took order_by('id').first(), so it attached the OLDEST
        row of that name — a previous season's player — and a name already in
        the draft blocked the real player from ever being added."""
        old_row = make_player("Same Name", "RB", year=2025, player_id=900)
        current_row = make_player("Same Name", "RB", year=2026, player_id=900)
        # The stale row is already in the draft, exactly the state that used to
        # make the current-year player look present.
        DraftPick.objects.create(draft=self.draft, player=old_row, drafted=False)

        created = self.draft.add_missing_players()

        self.assertEqual([player.pk for player in created], [current_row.pk])
        pick = DraftPick.objects.get(draft=self.draft, player=current_row)
        self.assertEqual(pick.player.year, 2026)
        self.assertFalse(pick.drafted)

    def test_two_different_players_sharing_a_name_both_get_rows(self):
        first = make_player("Twin Name", "WR", player_id=801)
        second = make_player("Twin Name", "TE", player_id=802)

        created = self.draft.add_missing_players()

        self.assertEqual({player.pk for player in created}, {first.pk, second.pk})


class FfcImportSummaryTests(TestCase):
    """`load_ffc_json` has to report WHICH players it created, because that list
    is what the admin refresh page prints for eyeballing. No network: the feed
    payload is fabricated."""

    def _feed(self, *players):
        return {'players': list(players)}

    def _row(self, player_id, name, position, adp=1.0, team='ATL'):
        return {
            'player_id': player_id, 'name': name, 'position': position,
            'adp_formatted': adp, 'team': team,
        }

    def test_reports_created_updated_and_skipped_kickers(self):
        from draft.management.commands.add_players import load_ffc_json

        existing = make_player("Known WR", "WR", player_id=4001)
        data = self._feed(
            self._row(4001, "Known WR", "WR"),
            self._row(4002, "Brand New RB", "RB"),
            self._row(4003, "Kick Er", "PK"),
        )

        summary = load_ffc_json([], 2026, data)

        self.assertEqual(summary.year, 2026)
        self.assertEqual(summary.feed_rows, 3)
        self.assertEqual(summary.updated, 1)
        self.assertEqual([player.player_id for player in summary.created], [4002])
        self.assertEqual(summary.skipped_kickers, 1)
        self.assertNotIn(existing.pk, [player.pk for player in summary.created])

    def test_no_price_basis_is_reported_and_prices_are_preserved(self):
        """Without HistoricalDraftPicks the import must leave prices alone
        rather than flatten them, and the report has to say so — the admin page
        shows it, since a silent no-op here looks identical to success."""
        from draft.management.commands.add_players import load_ffc_json

        player = make_player("Priced WR", "WR", player_id=4101)
        Player.objects.filter(pk=player.pk).update(projected_price=44)

        summary = load_ffc_json([], 2026, self._feed(self._row(4101, "Priced WR", "WR")))

        self.assertFalse(summary.priced)
        player.refresh_from_db()
        self.assertEqual(int(player.projected_price), 44)


class RiskFieldsTests(TestCase):
    """Hand-scored risk. The score is filtered on and the summary is READ during
    the bidding, so both have to survive the hand-written player serializer —
    and the admin's band filter has to keep "not reviewed" out of the low band.
    """

    def test_defaults_to_unreviewed(self):
        player = make_player("Unscored RB", "RB")
        self.assertEqual(player.risk_score, 0)
        self.assertIsNone(player.risk_summary)

    def test_available_players_carries_score_and_summary(self):
        from draft.api.views.draft import DraftPicksOutputSerializer
        from draft.services.draft.draft import DraftReadService

        draft = Draft.objects.create(year=2026, draft_name="risk")
        risky = make_player("Risky WR", "WR")
        Player.objects.filter(pk=risky.pk).update(
            risk_score=8, risk_summary="- coming off achilles\n- new OC",
        )
        unscored = make_player("Unscored WR", "WR")
        for player in (risky, unscored):
            DraftPick.objects.create(draft=draft, player=player, drafted=False)

        picks = DraftReadService(user=None).get_available_players(draft_id=draft.id)
        rows = {
            row["player"]["name"]: row["player"]
            for row in (DraftPicksOutputSerializer.serialize(pick) for pick in picks)
        }
        self.assertEqual(rows["Risky WR"]["risk_score"], 8)
        self.assertEqual(rows["Risky WR"]["risk_summary"], "- coming off achilles\n- new OC")
        self.assertEqual(rows["Unscored WR"]["risk_score"], 0)
        self.assertIsNone(rows["Unscored WR"]["risk_summary"])

    def test_band_filter_separates_unreviewed_from_low(self):
        from django.contrib.admin.sites import AdminSite
        from django.test import RequestFactory

        from draft.admin import PlayerAdmin, RiskBandFilter

        unscored = make_player("Zero Risk RB", "RB")
        low = make_player("Low Risk RB", "RB")
        Player.objects.filter(pk=low.pk).update(risk_score=2)
        high = make_player("High Risk RB", "RB")
        Player.objects.filter(pk=high.pk).update(risk_score=9)

        model_admin = PlayerAdmin(Player, AdminSite())
        request = RequestFactory().get("/")

        def names(band):
            flt = RiskBandFilter(request, {"risk_band": [band]}, Player, model_admin)
            return set(flt.queryset(request, Player.objects.all()).values_list("name", flat=True))

        self.assertEqual(names("unreviewed"), {"Zero Risk RB"})
        self.assertEqual(names("low"), {"Low Risk RB"})
        self.assertEqual(names("reviewed"), {"Low Risk RB", "High Risk RB"})
        self.assertEqual(names("extreme"), {"High Risk RB"})


class MyPriceVarianceFilterTests(TestCase):
    """Buckets my_price against the EFFECTIVE projected price
    (`override_price or projected_price`) — the same basis the board colours
    against. Using the raw projected_price column instead would mis-bucket every
    player carrying an override."""

    def setUp(self):
        from draft.admin import MyPriceVarianceFilter
        self.filter_class = MyPriceVarianceFilter

        def priced(name, projected, my_price=None, override=None):
            player = make_player(name, "RB")
            Player.objects.filter(pk=player.pk).update(
                projected_price=projected, my_price=my_price, override_price=override)
            return player

        priced("Above", 30, my_price=40)
        priced("Below", 30, my_price=20)
        priced("Equal", 30, my_price=30)
        priced("Unpriced", 30)
        # my_price 35 is ABOVE the raw 30 but BELOW the 50 override that
        # actually governs — the case a naive comparison gets backwards.
        priced("Overridden", 30, my_price=35, override=50)

    def build(self, value):
        instance = self.filter_class.__new__(self.filter_class)
        instance.used_parameters = {self.filter_class.parameter_name: value} if value else {}
        return instance

    def names(self, value):
        return sorted(
            self.build(value).queryset(None, Player.objects.all()).values_list("name", flat=True))

    def test_above_below_and_equal(self):
        self.assertEqual(self.names("above"), ["Above"])
        self.assertEqual(self.names("below"), ["Below", "Overridden"])
        self.assertEqual(self.names("equal"), ["Equal"])

    def test_unset_finds_the_unpriced(self):
        self.assertEqual(self.names("unset"), ["Unpriced"])

    def test_no_selection_is_a_no_op(self):
        self.assertEqual(len(self.names(None)), 5)


class PlayerTeamFilterTests(TestCase):
    """NFLTeam is one row per (code, year), so the stock FK filter lists a code
    once per season with nothing to tell them apart. The admin filter keys on the
    CODE instead — ARI is Arizona in every season."""

    def setUp(self):
        from draft.admin import PlayerTeamFilter
        from draft.models import NFLTeam

        self.filter_class = PlayerTeamFilter
        self.ari_2024 = NFLTeam.objects.create(code="ARI", year=2024)
        self.ari_2026 = NFLTeam.objects.create(code="ARI", year=2026)
        self.den_2026 = NFLTeam.objects.create(code="DEN", year=2026)

        self.old_cardinal = make_player("Old Cardinal", "RB", year=2024)
        self.new_cardinal = make_player("New Cardinal", "WR")
        self.bronco = make_player("Bronco", "TE")
        Player.objects.filter(pk=self.old_cardinal.pk).update(team=self.ari_2024)
        Player.objects.filter(pk=self.new_cardinal.pk).update(team=self.ari_2026)
        Player.objects.filter(pk=self.bronco.pk).update(team=self.den_2026)

    def build(self, value):
        instance = self.filter_class.__new__(self.filter_class)
        instance.used_parameters = {self.filter_class.parameter_name: value} if value else {}
        return instance

    def test_lookups_list_each_code_once(self):
        lookups = self.build(None).lookups(None, None)
        codes = [code for code, _ in lookups]
        self.assertEqual(codes, ["ARI", "DEN"])  # deduped and sorted

    def test_filtering_by_code_spans_every_season_of_that_team(self):
        filtered = self.build("ARI").queryset(None, Player.objects.all())
        self.assertCountEqual(
            filtered.values_list("name", flat=True), ["Old Cardinal", "New Cardinal"])

    def test_no_selection_is_a_no_op(self):
        self.assertEqual(self.build(None).queryset(None, Player.objects.all()).count(), 3)


class TargetTierCsvTests(TestCase):
    """write_target_tiers_to_csv → update_player_target_tiers is how hand-set
    tiers move from the machine whose /admin has them to the hosted DB, so the
    round trip and the file's source-of-truth semantics are the contract."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.path = os.path.join(self.tmpdir, "2026_target_tiers.csv")
        # Both commands resolve the file through csv_path(); point them at a
        # tempfile instead of the repo root.
        for module in (
            "draft.management.commands.write_target_tiers_to_csv.csv_path",
            "draft.management.commands.update_player_target_tiers.csv_path",
        ):
            patcher = mock.patch(module, return_value=self.path)
            patcher.start()
            self.addCleanup(patcher.stop)

        self.top = make_player("Top RB", "RB")
        self.mid = make_player("Mid WR", "WR")
        self.untiered = make_player("Untiered TE", "TE")

    def set_tiers(self, **tiers):
        for player, tier in tiers.items():
            getattr(self, player).target_tier = tier
            getattr(self, player).save(update_fields=["target_tier"])

    def reload(self, player):
        return Player.objects.get(pk=player.pk)

    def test_round_trip_restores_tiers(self):
        self.set_tiers(top=1, mid=3)
        call_command("write_target_tiers_to_csv", year=2026)

        Player.objects.update(target_tier=0)
        call_command("update_player_target_tiers", year=2026)

        self.assertEqual(self.reload(self.top).target_tier, 1)
        self.assertEqual(self.reload(self.mid).target_tier, 3)
        self.assertEqual(self.reload(self.untiered).target_tier, 0)

    def test_unlisted_players_are_cleared(self):
        self.set_tiers(top=1)
        call_command("write_target_tiers_to_csv", year=2026)
        # Tiered on the target DB but absent from the file: the file wins.
        self.set_tiers(mid=2)

        call_command("update_player_target_tiers", year=2026)

        self.assertEqual(self.reload(self.top).target_tier, 1)
        self.assertEqual(self.reload(self.mid).target_tier, 0)

    def test_no_clear_keeps_unlisted_tiers(self):
        self.set_tiers(top=1)
        call_command("write_target_tiers_to_csv", year=2026)
        self.set_tiers(mid=2)

        call_command("update_player_target_tiers", year=2026, no_clear=True)

        self.assertEqual(self.reload(self.mid).target_tier, 2)

    def test_dry_run_writes_nothing(self):
        self.set_tiers(top=1)
        call_command("write_target_tiers_to_csv", year=2026)
        Player.objects.update(target_tier=0)

        call_command("update_player_target_tiers", year=2026, dry_run=True)

        self.assertEqual(self.reload(self.top).target_tier, 0)

    def test_import_leaves_projected_price_alone(self):
        """Player.save() forces projected_price to max(price or 0, 1), so the
        import must go through queryset.update() or it silently reprices."""
        self.set_tiers(top=1)
        call_command("write_target_tiers_to_csv", year=2026)
        Player.objects.filter(pk=self.top.pk).update(projected_price=None)

        call_command("update_player_target_tiers", year=2026)

        refreshed = self.reload(self.top)
        self.assertEqual(refreshed.target_tier, 1)
        self.assertIsNone(refreshed.projected_price)

    def test_other_years_are_untouched(self):
        """player_id repeats across years (it's unique per year), so the import
        must scope to the year it was told about."""
        self.set_tiers(top=1)
        call_command("write_target_tiers_to_csv", year=2026)
        last_year = make_player("Top RB", "RB", year=2025, player_id=self.top.player_id)
        Player.objects.filter(pk=last_year.pk).update(target_tier=4)

        call_command("update_player_target_tiers", year=2026)

        self.assertEqual(self.reload(last_year).target_tier, 4)


class FavoriteCycleTests(TestCase):
    """favorite is tri-state: None (neutral) -> True (target) -> False (avoid) -> None."""

    def setUp(self):
        self.draft = Draft.objects.create(year=2026, draft_name="mock one")
        self.player = make_player("Cycle RB", "RB")

    def test_new_player_defaults_to_neutral(self):
        self.assertIsNone(self.player.favorite)

    def test_favorite_player_cycles(self):
        from draft.services.draft.draft import DraftWriteService
        service = DraftWriteService(user=None)
        for expected in (True, False, None, True):
            player = service.favorite_player(self.draft.id, self.player.player_id)
            self.assertEqual(player.favorite, expected)


class MockDraftTests(TestCase):
    """A MockDraft is one roster of slots with no managers; the rules worth
    asserting are the two uniqueness directions (move vs. replace), slot
    eligibility, and the budget arithmetic."""

    def setUp(self):
        self.mock = MockDraft.objects.create(name="sketch", year=2026, starting_budget=200)
        self.qb = make_player("Mock QB", "QB")
        self.rb = make_player("Mock RB", "RB")
        self.other_rb = make_player("Other Mock RB", "RB")
        self.service = MockDraftWriteService(user=None)

    def set_pick(self, player, slot, price=10):
        return self.service.set_pick(self.mock.id, player.player_id, slot, price)

    def test_budget_tracks_the_picks(self):
        self.set_pick(self.qb, "QB1", price=30)
        self.set_pick(self.rb, "RB1", price=45)

        self.assertEqual(self.mock.budget_spent, 75)
        self.assertEqual(self.mock.budget_remaining, 125)

    def test_repicking_a_player_moves_them(self):
        self.set_pick(self.rb, "RB1")
        self.set_pick(self.rb, "FLEX1")

        slots = self.mock.slot_picks()
        self.assertIsNone(slots["RB1"])
        self.assertEqual(slots["FLEX1"].player, self.rb)
        self.assertEqual(self.mock.picks.count(), 1)

    def test_filling_a_taken_slot_replaces_its_occupant(self):
        self.set_pick(self.rb, "RB1")
        self.set_pick(self.other_rb, "RB1")

        self.assertEqual(self.mock.slot_picks()["RB1"].player, self.other_rb)
        self.assertEqual(self.mock.picks.count(), 1)

    def test_ineligible_slot_is_rejected(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            self.set_pick(self.qb, "RB1")
        self.assertEqual(self.mock.picks.count(), 0)

    def test_clear_slot_empties_it(self):
        self.set_pick(self.qb, "QB1")
        self.service.clear_slot(self.mock.id, "QB1")

        self.assertIsNone(self.mock.slot_picks()["QB1"])

    def test_slot_picks_covers_every_slot(self):
        self.assertEqual(tuple(self.mock.slot_picks().keys()), DRAFT_PLAN_SLOTS)

    def test_available_players_excludes_picked_and_other_years(self):
        self.set_pick(self.rb, "RB1")
        make_player("Last Year WR", "WR", year=2025)

        available = MockDraftReadService(user=None).get_available_players(self.mock.id)

        names = [player.name for player in available]
        self.assertNotIn("Mock RB", names)
        self.assertNotIn("Last Year WR", names)
        self.assertIn("Mock QB", names)

    def test_available_players_excludes_unslottable_positions(self):
        make_player("Mock K", "K")

        available = MockDraftReadService(user=None).get_available_players(self.mock.id)

        self.assertNotIn("Mock K", [player.name for player in available])

    def test_create_plan_from_mock_draft(self):
        self.set_pick(self.qb, "QB1", price=30)
        self.set_pick(self.rb, "FLEX1", price=20)

        plan = DraftPlanWriteService(user=None).create_from_mock_draft(self.mock.id, name="from mock")

        self.assertEqual(plan.year, 2026)
        self.assertEqual(plan.qb1, self.qb)
        self.assertEqual(plan.flex1, self.rb)
        self.assertIsNone(plan.rb1)

    def test_plan_survives_mock_deletion(self):
        self.set_pick(self.qb, "QB1")
        plan = DraftPlanWriteService(user=None).create_from_mock_draft(self.mock.id, name="keeper")

        self.service.delete_mock_draft(self.mock.id)

        plan.refresh_from_db()
        self.assertEqual(plan.qb1, self.qb)


class MockDraftAPITests(TestCase):

    def setUp(self):
        self.client.force_login(make_drafter_user())
        self.qb = make_player("Api Mock QB", "QB")

    def test_create_pick_and_plan_roundtrip(self):
        created = self.client.post(
            "/api/drafts/draft/mocks/create/",
            {"params": {"name": "api sketch", "starting_budget": 150}},
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        mock_id = created.data["id"]
        self.assertIsNone(created.data["slots"]["QB1"]["pick"])
        self.assertEqual(list(created.data["slots"]["QB1"]["allowed_positions"]), ["QB"])

        available = self.client.get(f"/api/drafts/draft/mocks/{mock_id}/available_players/")
        self.assertEqual([player["name"] for player in available.data], ["Api Mock QB"])

        picked = self.client.post(
            f"/api/drafts/draft/mocks/{mock_id}/pick/{self.qb.player_id}/",
            {"params": {"position_slot": "QB1", "price": 40}},
            content_type="application/json",
        )
        self.assertEqual(picked.status_code, 200)
        self.assertEqual(picked.data["slots"]["QB1"]["pick"]["name"], "Api Mock QB")
        self.assertEqual(picked.data["budget_spent"], 40)
        self.assertEqual(picked.data["budget_remaining"], 110)

        plan = self.client.post(
            f"/api/drafts/draft/mocks/{mock_id}/create_plan/",
            {"params": {"name": "plan from mock"}},
            content_type="application/json",
        )
        self.assertEqual(plan.status_code, 201)
        self.assertEqual(plan.data["slots"]["QB1"]["name"], "Api Mock QB")

    def test_spectator_cannot_reach_any_mock_draft_endpoint(self):
        """Mock drafts are the drafter's private sketchpad — there is no
        spectator-visible flag for them, unlike Draft.available_to_spectators.
        Every endpoint is enumerated because one view missing its
        permission_classes is a hole nothing else would catch."""
        self.client.force_login(make_spectator_user())
        mock = MockDraft.objects.create(name="private", year=2026)
        player = make_player("Hidden RB", "RB")

        gets = [
            "/api/drafts/draft/mocks/",
            f"/api/drafts/draft/mocks/{mock.id}/",
            f"/api/drafts/draft/mocks/{mock.id}/available_players/",
        ]
        posts = [
            ("/api/drafts/draft/mocks/create/", {"name": "nope"}),
            (f"/api/drafts/draft/mocks/{mock.id}/delete/", {}),
            (f"/api/drafts/draft/mocks/{mock.id}/pick/{player.player_id}/",
             {"position_slot": "RB1", "price": 5}),
            (f"/api/drafts/draft/mocks/{mock.id}/clear_slot/", {"position_slot": "RB1"}),
            (f"/api/drafts/draft/mocks/{mock.id}/create_plan/", {"name": "nope"}),
        ]
        for url in gets:
            self.assertEqual(self.client.get(url).status_code, 403, url)
        for url, params in posts:
            response = self.client.post(url, {"params": params}, content_type="application/json")
            self.assertEqual(response.status_code, 403, url)

        # Nothing leaked through as a side effect.
        self.assertEqual(MockDraft.objects.count(), 1)
        self.assertEqual(mock.picks.count(), 0)
        self.assertEqual(DraftPlan.objects.count(), 0)

    def test_spectator_draft_list_is_unaffected_by_mocks(self):
        """The dashboard a spectator lands on: still only drafts flagged
        available_to_spectators, and MockDrafts are not among them (they aren't
        Drafts at all, so they can't leak into that list)."""
        visible = Draft.objects.create(year=2026, draft_name="the real one", available_to_spectators=True)
        Draft.objects.create(year=2026, draft_name="mockup draft", available_to_spectators=False)
        MockDraft.objects.create(name="sketch", year=2026)
        self.client.force_login(make_spectator_user())

        response = self.client.get("/api/drafts/draft/drafts")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([draft["draft_name"] for draft in response.data], [visible.draft_name])


# ---------------------------------------------------------------------------
# Multi-source ADP
# ---------------------------------------------------------------------------

class AdpMatchingTests(TestCase):
    """The matcher is the part of multi-source ADP that can be WRONG rather than
    merely broken: a bad match silently gives one player another's ADP, and the
    price curve then prices him on it. These lock down the ladder in
    draft/services/adp/matching.py."""

    def _row(self, name, position, team='ATL', pick=10.0, provider_id='x1'):
        from draft.services.adp.rows import AdpRow
        return AdpRow(provider_id=provider_id, name=name, position=position,
                      team_code=team, overall_pick=pick)

    def _matcher(self, **kwargs):
        from draft.services.adp.matching import PlayerMatcher
        return PlayerMatcher(2026, **kwargs)

    def test_normalize_folds_punctuation_accents_and_suffixes(self):
        from draft.services.adp.matching import normalize_name

        self.assertEqual(normalize_name("Ja'Marr Chase"), 'ja marr chase')
        self.assertEqual(normalize_name('Marvin Harrison Jr.'), 'marvin harrison')
        self.assertEqual(normalize_name('Kenneth Walker III'), 'kenneth walker')
        # Accents are folded, so a feed that spells a name either way still hits.
        self.assertEqual(normalize_name('Austin Ekelér'), 'austin ekeler')

    def test_flip_comma_name_handles_mfl_format_and_suffixes(self):
        from draft.services.adp.matching import flip_comma_name, normalize_name

        self.assertEqual(flip_comma_name('Gibbs, Jahmyr'), 'Jahmyr Gibbs')
        # MFL keeps the suffix on the SURNAME side; normalising drops it anyway.
        self.assertEqual(flip_comma_name('Walker III, Kenneth'), 'Kenneth Walker III')
        self.assertEqual(normalize_name(flip_comma_name('Walker III, Kenneth')),
                         normalize_name('Kenneth Walker'))
        # A name with no comma must pass through untouched, so this is safe to
        # call on every feed.
        self.assertEqual(flip_comma_name('Jahmyr Gibbs'), 'Jahmyr Gibbs')

    def test_exact_name_and_position_match(self):
        player = make_player('Jahmyr Gibbs', 'RB')
        result = self._matcher().match(self._row('Jahmyr Gibbs', 'RB'))
        self.assertEqual(result.player, player)
        self.assertEqual(result.method, 'exact')

    def test_same_name_different_position_does_not_collide(self):
        """Josh Allen the QB and Josh Allen the edge rusher both appear in MFL's
        feed. Position is part of the key precisely so the RB never inherits the
        QB's ADP."""
        qb = make_player('Josh Allen', 'QB')
        make_player('Josh Allen', 'WR')
        result = self._matcher().match(self._row('Josh Allen', 'QB'))
        self.assertEqual(result.player, qb)

    def test_fuzzy_match_within_position(self):
        player = make_player('DJ Moore', 'WR')
        result = self._matcher().match(self._row('D.J. Moore', 'WR'))
        self.assertEqual(result.player, player)
        self.assertTrue(result.is_fuzzy)

    def test_fuzzy_never_crosses_position(self):
        make_player('DJ Moore', 'WR')
        result = self._matcher().match(self._row('D.J. Moore', 'RB'))
        self.assertFalse(result.matched)

    def test_unrelated_name_is_a_miss_not_a_guess(self):
        make_player('Jahmyr Gibbs', 'RB')
        result = self._matcher().match(self._row('Bijan Robinson', 'RB'))
        self.assertFalse(result.matched)
        self.assertIsNone(result.player)

    def test_defense_matches_on_team_code_across_dialects(self):
        """The three feeds name the same defense three different ways, so DEF is
        matched on team CODE — and the codes themselves need folding: MFL says
        GBP where this DB says GB."""
        from draft.models import NFLTeam

        team = NFLTeam.objects.create(code='GB', year=2026)
        defense = make_player('Green Bay Defense', 'DEF')
        Player.objects.filter(pk=defense.pk).update(team=team)

        matcher = self._matcher()
        for feed_name, feed_code in [('Green Bay Defense', 'GB'),
                                     ('Packers, Green Bay', 'GBP'),
                                     ('Green Bay Packers', 'GB')]:
            result = matcher.match(self._row(feed_name, 'DEF', team=feed_code))
            self.assertEqual(result.player, defense, f'{feed_name} / {feed_code}')
            self.assertEqual(result.method, 'team')

    def test_jacksonville_code_alias(self):
        """FantasyPros says JAC, this DB says JAX — the alias that was silently
        dropping a defense before it was caught."""
        from draft.models import NFLTeam

        team = NFLTeam.objects.create(code='JAX', year=2026)
        defense = make_player('Jacksonville Defense', 'DEF')
        Player.objects.filter(pk=defense.pk).update(team=team)

        result = self._matcher().match(
            self._row('Jacksonville Jaguars', 'DEF', team='JAC'))
        self.assertEqual(result.player, defense)

    def test_defense_without_a_team_link_falls_back_to_city(self):
        """This DB really does have a defense with no team FK. Without the city
        fallback it could never receive ADP from any source."""
        make_player('Washington Defense', 'DEF')
        result = self._matcher().match(
            self._row('Washington Commanders', 'DEF', team='WAS'))
        self.assertIsNotNone(result.player)
        self.assertEqual(result.player.name, 'Washington Defense')

    def test_cached_provider_id_short_circuits_name_matching(self):
        """Once an id is learned, the name is irrelevant — which is what stops
        the fuzzy pass re-rolling its dice every sync."""
        player = make_player('Jahmyr Gibbs', 'RB')
        Player.objects.filter(pk=player.pk).update(mfl_id='16162')

        result = self._matcher(id_field='mfl_id').match(
            self._row('Completely Different Name', 'RB', provider_id='16162'))
        self.assertEqual(result.player, player)
        self.assertEqual(result.method, 'id')

    def test_remember_is_a_noop_when_ids_are_not_persisted(self):
        """FFC's provider id IS Player.player_id, so it must be read but never
        written back."""
        player = make_player('Jahmyr Gibbs', 'RB', player_id=5672)
        matcher = self._matcher(id_field='player_id', persist_id=False)
        self.assertFalse(matcher.remember(player, '9999'))
        self.assertEqual(player.player_id, 5672)


class AdpProviderParseTests(TestCase):
    """Feed parsing, against fabricated payloads shaped like the real ones. No
    network: these have to keep passing when a provider is unreachable."""

    def test_mfl_drops_kickers_and_idp_and_flips_names(self):
        from draft.services.adp.providers import mfl

        adp_payload = {'adp': {
            'totalDrafts': '692',
            'player': [
                {'id': '16162', 'averagePick': '1.75'},
                {'id': '9001', 'averagePick': '40.00'},   # IDP linebacker
                {'id': '9002', 'averagePick': '55.00'},   # kicker
                {'id': '0151', 'averagePick': '91.28'},   # team defense
            ],
        }}
        players_payload = {'players': {'player': [
            {'id': '16162', 'name': 'Gibbs, Jahmyr', 'position': 'RB', 'team': 'DET'},
            {'id': '9001', 'name': 'Backer, Line', 'position': 'LB', 'team': 'CHI'},
            {'id': '9002', 'name': 'Boot, Kick', 'position': 'PK', 'team': 'CHI'},
            {'id': '0151', 'name': 'Texans, Houston', 'position': 'Def', 'team': 'HOU'},
        ]}}

        result = mfl.parse(adp_payload, players_payload)

        # IDP and kickers must never reach the price curve.
        self.assertEqual([row.position for row in result.rows], ['RB', 'DEF'])
        self.assertEqual(result.rows[0].name, 'Jahmyr Gibbs')
        self.assertEqual(result.rows[0].overall_pick, 1.75)
        self.assertEqual(result.rows[0].provider_id, '16162')
        self.assertEqual(result.sample_size, 692)

    def test_mfl_skips_an_adp_id_with_no_player_row(self):
        from draft.services.adp.providers import mfl

        result = mfl.parse(
            {'adp': {'totalDrafts': '1', 'player': [{'id': 'ghost', 'averagePick': '5'}]}},
            {'players': {'player': []}},
        )
        self.assertEqual(result.rows, [])

    def test_fpros_maps_dst_and_uses_ecr_rank(self):
        from draft.services.adp.providers import fpros

        payload = {
            'total_experts': 109,
            'players': [
                {'player_id': '22968', 'player_name': 'Jahmyr Gibbs',
                 'player_position_id': 'RB', 'player_team_id': 'DET', 'rank_ecr': 1},
                {'player_id': '1', 'player_name': 'Houston Texans',
                 'player_position_id': 'DST', 'player_team_id': 'HOU', 'rank_ecr': 188},
                {'player_id': '2', 'player_name': 'Kick Er',
                 'player_position_id': 'K', 'player_team_id': 'HOU', 'rank_ecr': 200},
            ],
        }

        result = fpros.parse(payload)

        self.assertEqual([row.position for row in result.rows], ['RB', 'DEF'])
        # The rank stands in for an average pick — FantasyPros has no ADP for
        # unauthenticated callers.
        self.assertEqual(result.rows[0].overall_pick, 1)
        self.assertEqual(result.rows[1].overall_pick, 188)
        self.assertEqual(result.sample_size, 109)

    def test_ffc_stores_raw_adp_not_the_round_pick_string(self):
        """adp_formatted is round.pick; every source column is an OVERALL pick.
        Reading the wrong field here would put "1.01" in a column the apply step
        treats as pick number 1."""
        from draft.services.adp.providers import ffc

        payload = {'meta': {'total_drafts': 3144}, 'players': [
            {'player_id': 5672, 'name': 'Jahmyr Gibbs', 'position': 'RB',
             'team': 'DET', 'adp': 1.5, 'adp_formatted': '1.01'},
            {'player_id': 9, 'name': 'Kick Er', 'position': 'PK',
             'team': 'DET', 'adp': 150.0, 'adp_formatted': '15.01'},
        ]}

        result = ffc.parse(payload)

        self.assertEqual(len(result.rows), 1)
        self.assertEqual(result.rows[0].overall_pick, 1.5)
        self.assertEqual(result.sample_size, 3144)


class AdpSyncTests(TestCase):
    """A sync's defining property is what it LEAVES ALONE. If these fail, the
    sync has grown the power to move the board."""

    def setUp(self):
        self.player = make_player('Jahmyr Gibbs', 'RB')
        Player.objects.filter(pk=self.player.pk).update(
            adp_formatted='3.05', projected_price=44)

    def _feed(self, *rows):
        from draft.services.adp.rows import AdpRow, FeedResult
        return FeedResult(rows=[AdpRow(*row) for row in rows], sample_size=692)

    def _sync(self, feed, **kwargs):
        from draft.services.adp import sync as sync_module
        source = sync_module.get_source('mfl')
        patched = type(source)(**{**source.__dict__, 'fetch': lambda year: feed})
        with mock.patch.object(sync_module, 'get_source', return_value=patched):
            return sync_module.sync_source('mfl', year=2026, **kwargs)

    def test_writes_only_its_own_column(self):
        summary = self._sync(self._feed(('16162', 'Jahmyr Gibbs', 'RB', 'DET', 18.69)))

        self.player.refresh_from_db()
        self.assertEqual(summary.matched, 1)
        self.assertEqual(float(self.player.adp_mfl), 18.69)
        self.assertEqual(self.player.mfl_id, '16162')
        # The whole point: the board is untouched until apply_adp_source runs.
        self.assertEqual(str(self.player.adp_formatted), '3.05')
        self.assertEqual(int(self.player.projected_price), 44)
        self.assertIsNone(self.player.adp_ffc)

    def test_unmatched_rows_are_reported_and_never_created(self):
        summary = self._sync(self._feed(('99', 'Nobody At All', 'WR', 'ATL', 5.0)))

        self.assertEqual(summary.matched, 0)
        self.assertEqual(summary.unmatched_names, ['Nobody At All (WR)'])
        self.assertEqual(Player.objects.filter(year=2026).count(), 1)

    def test_dry_run_writes_nothing(self):
        summary = self._sync(
            self._feed(('16162', 'Jahmyr Gibbs', 'RB', 'DET', 18.69)), dry_run=True)

        self.player.refresh_from_db()
        self.assertEqual(summary.matched, 1)
        self.assertIsNone(self.player.adp_mfl)
        self.assertFalse(Player.objects.exclude(mfl_id=None).exists())

    def test_a_failing_feed_is_reported_not_raised(self):
        """One dead provider must not abort a multi-source run."""
        from draft.services.adp import sync as sync_module

        source = sync_module.get_source('mfl')

        def boom(year):
            raise RuntimeError('503 Service Unavailable')

        patched = type(source)(**{**source.__dict__, 'fetch': boom})
        with mock.patch.object(sync_module, 'get_source', return_value=patched):
            summary = sync_module.sync_source('mfl', year=2026)

        self.assertFalse(summary.ok)
        self.assertIn('503', summary.error)


class ApplyAdpSourceTests(TestCase):
    """Toggling the effective source: what gets re-derived, and what is
    deliberately left alone."""

    def setUp(self):
        from draft.models import AdpSourceSync

        self.ranked = make_player('Ranked RB', 'RB')
        self.other = make_player('Other WR', 'WR')
        # Covered by no source — the coverage-gap case.
        self.unranked = make_player('Uncovered TE', 'TE')
        Player.objects.filter(pk=self.ranked.pk).update(
            adp_mfl=1.75, adp_formatted='9.09', projected_price=5)
        Player.objects.filter(pk=self.other.pk).update(
            adp_mfl=25.0, adp_formatted='1.01', projected_price=70)
        Player.objects.filter(pk=self.unranked.pk).update(
            adp_formatted='4.04', projected_price=33)
        AdpSourceSync.objects.create(source='mfl', year=2026, matched=2)

    def test_round_pick_derivation_reproduces_ffc_formatting(self):
        from draft.services.adp.apply import to_round_pick

        # The exact values FFC publishes for these picks, at 10 teams. Verified
        # against the live feed: 198 of 207 rows round-trip identically.
        self.assertEqual(str(to_round_pick(1.4)), '1.01')
        self.assertEqual(str(to_round_pick(80.8)), '9.01')
        self.assertEqual(str(to_round_pick(92.1)), '10.02')
        # Guards the (overall - 1) arithmetic against an off-by-one at the
        # round boundary.
        self.assertEqual(str(to_round_pick(10)), '1.10')
        self.assertEqual(str(to_round_pick(11)), '2.01')
        # A pick below 1 can't exist but must not produce round 0.
        self.assertEqual(str(to_round_pick(0.4)), '1.01')
        # Exact .5 ties are arbitrary — FFC itself rounds them both ways, since
        # the adp it publishes is already rounded to one decimal. Pinned only so
        # the behaviour is deliberate rather than accidental.
        self.assertEqual(str(to_round_pick(1.5)), '1.02')

    def test_ranked_players_are_re_derived_and_re_priced(self):
        from draft.services.adp.apply import apply_source

        report = apply_source('mfl', year=2026, price_basis='default')

        self.ranked.refresh_from_db()
        self.other.refresh_from_db()
        self.assertEqual(report.ranked, 2)
        # 1.75 -> pick 2 -> round 1, pick 2.
        self.assertEqual(str(self.ranked.adp_formatted), '1.02')
        self.assertEqual(str(self.other.adp_formatted), '3.05')
        self.assertEqual(self.ranked.adp_source, 'mfl')
        # Priced by ADP ORDER, so the first-ranked player takes the top of the
        # curve regardless of what he was worth under the previous source.
        self.assertGreater(self.ranked.projected_price, self.other.projected_price)

    def test_players_the_source_does_not_rank_are_left_untouched(self):
        """The user's rule: a sync/apply adds data, it does not overwrite. A
        coverage gap must not bury a real player or wipe his price."""
        from draft.services.adp.apply import apply_source

        report = apply_source('mfl', year=2026, price_basis='default')

        self.unranked.refresh_from_db()
        self.assertEqual(report.unranked, 1)
        self.assertEqual(str(self.unranked.adp_formatted), '4.04')
        self.assertEqual(int(self.unranked.projected_price), 33)
        # Marked, so the gap is findable in /admin.
        self.assertEqual(self.unranked.adp_source, '')

    def test_no_historical_picks_leaves_prices_alone(self):
        """Preserves the existing guard: silently flattening every price looks
        identical to success."""
        from draft.services.adp.apply import apply_source

        report = apply_source('mfl', year=2026, price_basis='historical')

        self.ranked.refresh_from_db()
        self.assertEqual(report.priced, 0)
        self.assertEqual(int(self.ranked.projected_price), 5)
        # ADP still moves — only pricing is withheld.
        self.assertEqual(str(self.ranked.adp_formatted), '1.02')

    def test_price_basis_none_moves_adp_only(self):
        from draft.services.adp.apply import apply_source

        apply_source('mfl', year=2026, price_basis='none')

        self.ranked.refresh_from_db()
        self.assertEqual(int(self.ranked.projected_price), 5)
        self.assertEqual(str(self.ranked.adp_formatted), '1.02')

    def test_dry_run_writes_nothing(self):
        from draft.services.adp.apply import active_source, apply_source

        report = apply_source('mfl', year=2026, price_basis='default', dry_run=True)

        self.ranked.refresh_from_db()
        self.assertEqual(report.ranked, 2)
        self.assertEqual(str(self.ranked.adp_formatted), '9.09')
        self.assertEqual(active_source(2026), '')

    def test_applying_marks_exactly_one_source_active(self):
        from draft.models import AdpSourceSync
        from draft.services.adp.apply import active_source, apply_source

        AdpSourceSync.objects.create(source='ffc', year=2026, is_active=True)

        apply_source('mfl', year=2026, price_basis='none')

        self.assertEqual(active_source(2026), 'mfl')
        self.assertEqual(
            AdpSourceSync.objects.filter(year=2026, is_active=True).count(), 1)

    def test_unknown_source_is_rejected(self):
        from draft.services.adp.apply import apply_source

        with self.assertRaises(ValueError):
            apply_source('espn', year=2026)

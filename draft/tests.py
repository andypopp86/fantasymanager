import os
import tempfile
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from draft.models import DRAFT_PLAN_SLOTS, Draft, DraftPick, DraftPlan, Manager, Player
from draft.services.draft.draft_plan import DraftPlanWriteService


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

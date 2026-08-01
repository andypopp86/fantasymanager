from django.contrib.auth import get_user_model
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
    (non-staff) → board reads only, drafter (staff) → everything."""

    def setUp(self):
        self.draft = Draft.objects.create(year=2026, draft_name="authz")
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

    def test_spa_entrypoint_requires_login(self):
        response = self.client.get("/app/")
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith("/login/"))
        self.client.force_login(self.spectator)
        self.assertEqual(self.client.get("/app/").status_code, 200)

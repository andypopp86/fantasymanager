from django.http import Http404

from core.services.base import BaseService
from draft.models import DRAFT_PLAN_SLOTS, Draft, DraftPick, DraftPlan, MockDraft


def build_plan(name, year, slot_players):
    """Save a DraftPlan from an iterable of (slot_name, player) pairs.

    Shared by both creation paths (a mock Draft's results and a MockDraft's
    slots); pairs whose slot isn't a plan slot are ignored.
    """
    plan = DraftPlan(name=name, year=year)
    for slot, player in slot_players:
        if slot in DRAFT_PLAN_SLOTS:
            setattr(plan, slot.lower(), player)
    plan.save()
    return plan


class DraftPlanReadService(BaseService):

    def get_plans(self, year=None):
        plans = DraftPlan.objects.all()
        if year:
            plans = plans.filter(year=year)
        return plans

    def get_plan(self, plan_id):
        return DraftPlan.objects.get(id=plan_id)


class DraftPlanWriteService(BaseService):

    def create_from_draft(self, draft_id, name):
        """Snapshot the drafter's actual results (drafted picks, by slot) from a
        mock draft into a standalone, reusable DraftPlan."""
        draft = Draft.objects.get(id=draft_id)
        picks = DraftPick.objects.filter(
            draft=draft,
            drafted=True,
            manager__drafter=True,
        ).select_related('player')
        return build_plan(
            name, draft.year, ((pick.position_slot, pick.player) for pick in picks),
        )

    def create_from_mock_draft(self, mock_draft_id, name):
        """Snapshot a MockDraft's filled slots into a standalone DraftPlan.

        The whole point of MockDraft: the plan can be built without standing up a
        full Draft first. Prices don't carry over — a plan is players only, and
        applying it re-prices from override/projected.
        """
        mock = MockDraft.objects.filter(id=mock_draft_id).first()
        if not mock:
            raise Http404
        picks = mock.picks.select_related('player')
        return build_plan(
            name, mock.year, ((pick.position_slot, pick.player) for pick in picks),
        )

    def delete_plan(self, plan_id):
        DraftPlan.objects.filter(id=plan_id).delete()

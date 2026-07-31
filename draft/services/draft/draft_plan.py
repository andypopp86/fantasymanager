from core.services.base import BaseService
from draft.models import DRAFT_PLAN_SLOTS, Draft, DraftPick, DraftPlan


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
        plan = DraftPlan(name=name, year=draft.year)
        picks = DraftPick.objects.filter(
            draft=draft,
            drafted=True,
            manager__drafter=True,
        ).select_related('player')
        for pick in picks:
            if pick.position_slot in DRAFT_PLAN_SLOTS:
                setattr(plan, pick.position_slot.lower(), pick.player)
        plan.save()
        return plan

    def delete_plan(self, plan_id):
        DraftPlan.objects.filter(id=plan_id).delete()

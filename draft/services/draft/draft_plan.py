from django.http import Http404
from rest_framework.exceptions import APIException

from core.services.base import BaseService
from draft.models import (
    BACKUP_DEPTH,
    DRAFT_PLAN_SLOTS,
    Draft,
    DraftPick,
    DraftPlan,
    DraftPlanBackup,
    MockDraft,
)


class PlanNameConflict(APIException):
    """(year, name) already names a plan and the caller didn't ask to replace it.

    409 rather than 400 so the client can tell "that name is taken" apart from
    bad input and offer to overwrite (which is what re-saving a plan means).
    """
    status_code = 409
    default_detail = 'A plan with that name already exists for this year.'
    default_code = 'plan_name_conflict'


def build_plan(name, year, slot_players, slot_backups=(), overwrite=False):
    """Save a DraftPlan from an iterable of (slot_name, player) pairs, plus
    optional (slot_name, rank, player) backup cells.

    Shared by both creation paths (a mock Draft's results and a MockDraft's
    slots); pairs whose slot isn't a plan slot are ignored.

    (year, name) is the plan's identity: an existing one is REPLACED when
    `overwrite` is set — every slot and every backup cell, so a re-save is the
    new roster and not a merge with the old one — and raises otherwise.
    """
    plan = DraftPlan.objects.filter(year=year, name=name).first()
    if plan and not overwrite:
        raise PlanNameConflict()
    if not plan:
        plan = DraftPlan(name=name, year=year)
    for slot in DRAFT_PLAN_SLOTS:
        setattr(plan, slot.lower(), None)
    for slot, player in slot_players:
        if slot in DRAFT_PLAN_SLOTS:
            setattr(plan, slot.lower(), player)
    plan.save()
    plan.backups.all().delete()
    DraftPlanBackup.objects.bulk_create([
        DraftPlanBackup(plan=plan, position_slot=slot, rank=rank, player=player)
        for slot, rank, player in slot_backups
        if slot in DRAFT_PLAN_SLOTS and 1 <= rank <= BACKUP_DEPTH
    ])
    return plan


class DraftPlanReadService(BaseService):

    def get_plans(self, year=None):
        plans = DraftPlan.objects.all().prefetch_related('backups__player')
        if year:
            plans = plans.filter(year=year)
        return plans

    def get_plan(self, plan_id):
        return DraftPlan.objects.get(id=plan_id)


class DraftPlanWriteService(BaseService):

    def create_from_draft(self, draft_id, name, overwrite=False):
        """Snapshot the drafter's actual results (drafted picks, by slot) from a
        mock draft into a standalone, reusable DraftPlan.

        No backups come along: the board's shelf lives only in the browser
        (Dexie), so the server has nothing to copy. Backups are authored on a
        MockDraft.
        """
        draft = Draft.objects.get(id=draft_id)
        picks = DraftPick.objects.filter(
            draft=draft,
            drafted=True,
            manager__drafter=True,
        ).select_related('player')
        return build_plan(
            name, draft.year, ((pick.position_slot, pick.player) for pick in picks),
            overwrite=overwrite,
        )

    def create_from_mock_draft(self, mock_draft_id, name, overwrite=False):
        """Snapshot a MockDraft's filled slots into a standalone DraftPlan.

        The whole point of MockDraft: the plan can be built without standing up a
        full Draft first. Prices don't carry over — a plan is players only, and
        applying it re-prices from override/projected. The mock's backup shelves
        DO carry over: they're the whole reason a plan can hold alternates.
        """
        mock = MockDraft.objects.filter(id=mock_draft_id).first()
        if not mock:
            raise Http404
        picks = mock.picks.select_related('player')
        backups = mock.backups.select_related('player')
        return build_plan(
            name, mock.year, ((pick.position_slot, pick.player) for pick in picks),
            slot_backups=(
                (backup.position_slot, backup.rank, backup.player) for backup in backups
            ),
            overwrite=overwrite,
        )

    def delete_plan(self, plan_id):
        DraftPlan.objects.filter(id=plan_id).delete()

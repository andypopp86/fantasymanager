from django.db.models import Case, F, When
from django.http import Http404
from rest_framework.exceptions import ValidationError

from core.services.base import BaseService
from django.utils import timezone

from draft import models as d
from draft.services.draft.draft import validate_slot_eligibility


# A MockDraft only has the 16 roster slots, so a player no slot could ever hold
# (kickers, and anything else outside the position set) has no business in its
# player list.
SLOTTABLE_POSITIONS = tuple(sorted({
    position for positions in d.ALLOWED_POSITIONS.values() for position in positions
}))


class MockDraftReadService(BaseService):

    def get_mock_drafts(self, year=None):
        mocks = d.MockDraft.objects.all().prefetch_related('picks')
        if year:
            mocks = mocks.filter(year=year)
        return mocks

    def get_mock_draft(self, mock_draft_id):
        mock = d.MockDraft.objects.filter(id=mock_draft_id).prefetch_related(
            'picks__player', 'picks__player__team',
            'backups__player', 'backups__player__team',
        ).first()
        if not mock:
            raise Http404
        return mock

    def get_available_players(self, mock_draft_id):
        """Players eligible to be picked in this mock: the mock's YEAR, minus the
        ones already occupying a slot in it.

        Backups do NOT come out of the list: an alternate is a candidate, not a
        commitment, and the same player may back up several slots.

        Unlike a Draft's available_players — which reads DraftPick rows — a mock
        has no per-player rows, so availability comes straight from Player.
        """
        mock = self.get_mock_draft(mock_draft_id)
        taken_ids = mock.picks.values_list('player_id', flat=True)
        players = d.Player.objects.filter(
            year=mock.year,
            position__in=SLOTTABLE_POSITIONS,
        ).exclude(id__in=taken_ids).select_related('team').annotate(
            effective_price=Case(
                When(override_price__isnull=False, then=F('override_price')),
                default=F('projected_price'),
            )
        ).order_by('-effective_price', 'adp_formatted')
        return players


class MockDraftWriteService(BaseService):

    def create_mock_draft(self, name, starting_budget=200, year=None):
        return d.MockDraft.objects.create(
            name=name,
            year=year or timezone.now().year,
            starting_budget=starting_budget,
        )

    def delete_mock_draft(self, mock_draft_id):
        d.MockDraft.objects.filter(id=mock_draft_id).delete()

    def set_pick(self, mock_draft_id, player_id, position_slot, price):
        """Put `player_id` (an FFC player_id, resolved within the mock's year)
        into `position_slot` at `price`.

        Both uniqueness directions are resolved here rather than left to collide:
        the player MOVES if they already sit in another slot, and whoever
        occupied the target slot is dropped from the mock. The client shows the
        slot's contents, so choosing a filled slot is a deliberate replacement.
        """
        mock = d.MockDraft.objects.filter(id=mock_draft_id).first()
        if not mock:
            raise Http404
        player = d.Player.objects.filter(year=mock.year, player_id=player_id).first()
        if not player:
            raise ValidationError(f"No {mock.year} player with id {player_id}")
        elig_err = validate_slot_eligibility(player, position_slot)
        if elig_err:
            raise ValidationError(elig_err)
        # Drop the incumbent (if it isn't the same player moving in place).
        mock.picks.filter(position_slot=position_slot).exclude(player=player).delete()
        pick, _ = d.MockPick.objects.get_or_create(
            mock_draft=mock, player=player, defaults={'position_slot': position_slot},
        )
        pick.position_slot = position_slot
        pick.price = int(float(price))
        pick.save()
        # auto_now on the mock only fires on its own save; touch it so the list
        # can order by "last worked on".
        mock.save(update_fields=['last_update_time'])
        return pick

    def clear_slot(self, mock_draft_id, position_slot):
        mock = d.MockDraft.objects.filter(id=mock_draft_id).first()
        if not mock:
            raise Http404
        mock.picks.filter(position_slot=position_slot).delete()
        mock.save(update_fields=['last_update_time'])

    def set_backup(self, mock_draft_id, player_id, position_slot, rank):
        """Park `player_id` on `position_slot`'s shelf at depth `rank`.

        A backup stands in for one specific slot, so it has to satisfy that
        slot's own eligibility — the same rule the budget row's shelf enforces
        on the board. Within a shelf a player is unique, so re-parking someone
        already on it MOVES them (their old cell empties) rather than colliding;
        whoever held the target cell is dropped. Other slots' shelves are left
        alone: a handcuff RB legitimately backs up both RB1 and RB2.
        """
        mock = d.MockDraft.objects.filter(id=mock_draft_id).first()
        if not mock:
            raise Http404
        if not 1 <= int(rank) <= d.BACKUP_DEPTH:
            raise ValidationError(f"rank must be between 1 and {d.BACKUP_DEPTH}")
        player = d.Player.objects.filter(year=mock.year, player_id=player_id).first()
        if not player:
            raise ValidationError(f"No {mock.year} player with id {player_id}")
        elig_err = validate_slot_eligibility(player, position_slot)
        if elig_err:
            raise ValidationError(elig_err)
        shelf = mock.backups.filter(position_slot=position_slot)
        shelf.filter(rank=rank).exclude(player=player).delete()
        backup, _ = d.MockBackup.objects.get_or_create(
            mock_draft=mock, position_slot=position_slot, player=player,
            defaults={'rank': int(rank)},
        )
        backup.rank = int(rank)
        backup.save()
        mock.save(update_fields=['last_update_time'])
        return backup

    def clear_backup(self, mock_draft_id, position_slot, rank):
        mock = d.MockDraft.objects.filter(id=mock_draft_id).first()
        if not mock:
            raise Http404
        mock.backups.filter(position_slot=position_slot, rank=rank).delete()
        mock.save(update_fields=['last_update_time'])

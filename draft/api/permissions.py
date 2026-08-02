from rest_framework.permissions import BasePermission

from draft.models import Draft


class IsSpectatorVisible(BasePermission):
    """Per-draft read gate: staff see every draft; spectators only drafts
    flagged available_to_spectators (mockups stay hidden even by URL/ID
    guessing). Apply to views whose URL carries a draft_id."""

    message = "This draft is not available to spectators."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_staff:
            return True
        draft_id = view.kwargs.get("draft_id")
        return Draft.objects.filter(
            id=draft_id, available_to_spectators=True,
        ).exists()


class IsSuperuser(BasePermission):
    """Cross-site sync tier: superuser only. Used by the spectator-sync
    endpoints that a local copy of the site polls against the hosted
    deploy during a live draft."""

    message = "Superuser access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


class IsDrafter(BasePermission):
    """Full-access tier: staff accounts (the app owner).

    Non-staff accounts are spectators — they get only the read endpoints
    that leave this permission off (draft list/detail, managers, picks,
    board detail). All writes and drafter-private reads (available players,
    budget, watchlist, plans) require staff.
    """

    message = "Drafter (staff) access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff)

from rest_framework.permissions import SAFE_METHODS, BasePermission

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


class DraftIsUnlocked(BasePermission):
    """Per-draft WRITE gate: a draft flagged `locked` takes no changes.

    Locking freezes a draft's own rows — picks, budget, the allocation plan — so
    a finished draft can be read, replayed and reported on but never nudged. The
    gate lives here rather than in each view or service so a new write endpoint
    is frozen by adding this class, not by remembering an `if`.

    Two deliberate exclusions:

    - **Safe methods pass.** A locked draft is fully readable; the board, the
      summary and the playback pages must keep working.
    - **Favorites and the watchlist are NOT draft state.** Both write
      `Player.favorite` / `Player.watched`, which are keyed on (player, year)
      and shared by every draft that season, so locking one draft must not
      freeze a flag the other drafts read too.

    Pairs with `protected`, which blocks DELETION and is enforced on the model
    (`Draft.delete`) — the two flags are independent.
    """

    message = "This draft is locked; its picks and budget can't be changed."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        draft_id = view.kwargs.get("draft_id")
        if draft_id is None:
            return True
        return not Draft.objects.filter(id=draft_id, locked=True).exists()

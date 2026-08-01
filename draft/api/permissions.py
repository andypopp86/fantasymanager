from rest_framework.permissions import BasePermission


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

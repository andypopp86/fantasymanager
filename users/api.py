from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView


class MeAPI(APIView):
    """Who am I — lets the SPA route drafter vs spectator accounts.

    is_staff is the role flag: staff = drafter (full access), non-staff =
    spectator (read-only board views). Server-side enforcement lives in
    draft.api.permissions.IsDrafter; this endpoint only informs the UI.
    """

    def get(self, request):
        user = request.user
        return Response(
            {
                "email": user.email,
                "username": user.username,
                "is_staff": user.is_staff,
            },
            status=status.HTTP_200_OK,
        )

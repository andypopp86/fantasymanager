from django.urls import include, path
from . import views as api_views

draft_urlpatterns = [
    path("detail/<int:draft_id>", api_views.DraftDetailAPI.as_view(), name="draft"),
    path("<int:draft_id>/managers/detail/", api_views.DraftManagersAPI.as_view(), name="draft_managers"),
    path("<int:draft_id>/draft_board/detail/", api_views.DraftBoardAPI.as_view(), name="draft_board"),

    # path("draft_board/<int:draft_id>", api_views.DraftBoardAPI.as_view(), name="draft"),
    # path("detail/<int:draft_id>", api_views.DraftDetailAPI.as_view(), name="draft"),
    # path("detail/<int:draft_id>", api_views.DraftDetailAPI.as_view(), name="draft"),
]

urlpatterns = [
    path("draft/", include((draft_urlpatterns, "draft"), namespace="draft")),
]
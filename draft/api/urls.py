from django.urls import include, path
from . import views as api_views

draft_urlpatterns = [
    # reads
    path("drafts", api_views.DraftListAPI.as_view(), name="draft_list"),
    path("create/", api_views.DraftCreateAPI.as_view(), name="draft_create"),
    path("delete/<int:draft_id>/", api_views.DraftDeleteAPI.as_view(), name="draft_delete"),
    path("<int:draft_id>/detail/", api_views.DraftDetailAPI.as_view(), name="draft"),
    path("<int:draft_id>/managers/detail/", api_views.DraftManagersAPI.as_view(), name="draft_managers"),
    path("<int:draft_id>/draft_board/detail/", api_views.DraftBoardAPI.as_view(), name="draft_board"),
    path("<int:draft_id>/picks/", api_views.DraftPicksAPI.as_view(), name="draft_picks"),
    path("<int:draft_id>/available_players/", api_views.DraftAvailablePlayersAPI.as_view(), name="draft_available_players"),
    path("<int:draft_id>/manager_picks/", api_views.ManagerDraftedPlayersAPI.as_view(), name="manager_picks"),
    path("<int:draft_id>/budgeted_picks/", api_views.DraftBudgetedPicksAPI.as_view(), name="budgeted_picks"),
    path("<int:draft_id>/watched_picks/", api_views.DraftWatchedPicksAPI.as_view(), name="watched_picks"),
    path("<int:draft_id>/favorite_player/<int:player_id>/", api_views.DraftFavoritePickAPI.as_view(), name="favorite_player"),
    # /api/drafts/draft/${draft_id}/submit_pick/${manager_id}/${player_id}`

    # writes
    path("<int:draft_id>/submit_pick/<int:manager_id>/<int:player_id>/", api_views.DraftSubmitPickAPI.as_view(), name="draft_submit_pick"),
    path("<int:draft_id>/unsubmit_pick/<int:manager_id>/<int:player_id>/", api_views.DraftUnsubmitPickAPI.as_view(), name="draft_unsubmit_pick"),
    path("<int:draft_id>/budget_pick/<int:manager_id>/<int:player_id>/", api_views.DraftBudgetPickAPI.as_view(), name="draft_budget_pick"),
    path("<int:draft_id>/unbudget_pick/<int:manager_id>/<int:player_id>/", api_views.DraftUnbudgetPickAPI.as_view(), name="draft_unbudget_pick"),
    path("<int:draft_id>/watch/<int:manager_id>/<int:player_id>/", api_views.DraftWatchPickAPI.as_view(), name="watch_pick"),
    path("<int:draft_id>/reslot_picks/<int:manager_id>/", api_views.DraftReslotPicksAPI.as_view(), name="reslot_picks"),
    path("<int:draft_id>/reslot_budget/<int:manager_id>/", api_views.DraftReslotBudgetAPI.as_view(), name="reslot_budget"),

    # path("draft_board/<int:draft_id>", api_views.DraftBoardAPI.as_view(), name="draft"),
    # path("detail/<int:draft_id>", api_views.DraftDetailAPI.as_view(), name="draft"),
    # path("detail/<int:draft_id>", api_views.DraftDetailAPI.as_view(), name="draft"),
]

urlpatterns = [
    path("draft/", include((draft_urlpatterns, "draft"), namespace="draft")),
]
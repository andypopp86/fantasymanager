from django.urls import path, include
from django.views.generic import RedirectView

from draft import views as d



app_name = 'Rule'

urlpatterns = [
	# The React SPA moved to /app/ (see fantasy/urls.py); keep old bookmarks working.
	path(r'react_draft_entrypoint/', RedirectView.as_view(url='/app/'), name='react_draft_entrypoint'),
	path(r'unbudget_player/<int:draft_id>/<int:player_id>/', d.unbudget_player, name='unbudget_player'),
	path(r'watch_player/<int:draft_id>/<int:player_id>/', d.watch_player, name='watch_player'),
	path(r'unwatch_player/<int:draft_id>/<int:player_id>/', d.unwatch_player, name='unwatch_player'),
	path(r'historical_picks/', d.historical_draft_picks, name='historical_picks'),
	path(r'favorite_player/<int:draft_id>/<int:player_id>/', d.favorite_player, name='favorite_player'),
	path(r'unfavorite_player/<int:draft_id>/<int:player_id>/', d.unfavorite_player, name='unfavorite_player'),
	path(r'skepticism_rating/<int:draft_id>/<int:player_id>/', d.skepticism_rating, name='skepticism_rating'),
	path(r'notes/<int:draft_id>/', d.update_notes, name='update_notes'),
    path("<int:year>/player_stats/<int:draft_id>/", d.player_stats, name="player_stats"),
    path("<int:year>/override_prices/", d.override_prices, name="override_prices"),
    path("player_running_totals/<int:draft_id>/", d.player_running_totals, name="player_running_totals"),
]
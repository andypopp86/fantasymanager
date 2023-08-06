from django.urls import path

from draft import views as d



app_name = 'Rule'

urlpatterns = [
	path(r'', d.list, name='list'),
	path(r'create/', d.create_draft, name='create'),
	path(r'start/', d.start_draft, name='start'),
	path(r'board/<int:draft_id>/', d.draft_board, name='board'),
	path(r'board/<int:draft_id>/json/', d.get_draft_board_json, name='board_data_json'),
	path(r'board/<int:draft_id>/data/', d.get_draft_board_data, name='board_data'),
	path(r'board_prices/<int:draft_id>/<int:rounds>', d.price_board, name='price_board'),
	path(r'draft_player/<int:draft_id>/<int:player_id>/', d.draft_player, name='draft_player'),
	path(r'undraft_player/<int:draft_id>/<int:player_id>/', d.undraft_player, name='undraft_player'),
	path(r'unbudget_player/<int:draft_id>/<int:player_id>/', d.unbudget_player, name='undraft_player'),
	path(r'watch_player/<int:draft_id>/<int:player_id>/', d.watch_player, name='watch_player'),
	path(r'unwatch_player/<int:draft_id>/<int:player_id>/', d.unwatch_player, name='unwatch_player'),
	path(r'budget_player/<int:draft_id>/<int:player_id>/', d.budget_player, name='budget_player'),
	path(r'save_projected_team/<int:draft_id>/', d.save_projected_team, name='save_projected_team'),
	path(r'historical_picks/', d.historical_draft_picks, name='historical_picks'),
	path(r'save_position_slots/<int:draft_id>/', d.save_position_slots, name='save_position_slots'),
]
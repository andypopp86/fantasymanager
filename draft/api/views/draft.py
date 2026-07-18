from django.http import HttpRequest
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from drf_spectacular.utils import extend_schema

from core.api.serializers.base import BaseSerializer, BaseInputSerializer
from draft.services.draft.draft import DraftReadService, DraftManagersReadService, DraftBoardReadService, DraftWriteService

class LargeResultsSetPagination(PageNumberPagination):
    page_size = 1000
    page_size_query_param = 'page_size'
    max_page_size = 10000

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000

class SmallResultsSetPagination(PageNumberPagination):
    page_size = 0
    page_size_query_param = 'page_size'
    max_page_size = 0


class NFLTeamSerializer(BaseSerializer):
    code =  serializers.CharField()
    name =  serializers.CharField()
    short_name =  serializers.CharField()
    year =  serializers.IntegerField()
    playoff_weather_score =  serializers.IntegerField()
    playoff_schedule =  serializers.IntegerField()
    early_season_schedule =  serializers.IntegerField()
    early_season_qb =  serializers.IntegerField()
    early_season_wr =  serializers.IntegerField()
    early_season_rb =  serializers.IntegerField()
    early_season_te =  serializers.IntegerField()
    early_season_def =  serializers.IntegerField()
    playoff_qb =  serializers.IntegerField()
    playoff_wr =  serializers.IntegerField()
    playoff_rb =  serializers.IntegerField()
    playoff_te =  serializers.IntegerField()
    playoff_def =  serializers.IntegerField()
    defensive_ranking =  serializers.IntegerField()
    oline_ranking =  serializers.IntegerField()
    run_ranking =  serializers.IntegerField()
    pass_ranking =  serializers.IntegerField()

class PlayerOutputSerializer(BaseSerializer):
    player_id = serializers.CharField()
    name = serializers.CharField()
    position = serializers.CharField()
    adp_formatted = serializers.DecimalField(max_digits=8, decimal_places=2)
    projected_price = serializers.DecimalField(max_digits=8, decimal_places=2)
    override_price = serializers.DecimalField(max_digits=8, decimal_places=2)
    nickname = serializers.CharField()
    team = NFLTeamSerializer(read_only=True)
    year = serializers.IntegerField()
    favorite = serializers.BooleanField()
    offensive_support = serializers.IntegerField()
    skepticism = serializers.IntegerField()

class DraftOutputSerializer(BaseSerializer):
    year = serializers.IntegerField()
    draft_name = serializers.CharField()
    drafter = serializers.CharField()
    projected_draft = None
    saved_slots = None
    locked = serializers.BooleanField()
    starting_budget = serializers.IntegerField()
    limit_qb = serializers.IntegerField()
    limit_rb = serializers.IntegerField()
    limit_wr = serializers.IntegerField()
    limit_te = serializers.IntegerField()
    limit_def = serializers.IntegerField()

class ManagerOutputSerializer(BaseSerializer):
    draft = DraftOutputSerializer()
    id = serializers.IntegerField()
    name = serializers.CharField()
    budget = serializers.FloatField()
    drafter = serializers.BooleanField()
    position = serializers.IntegerField()


class DraftOutputSerializer(BaseSerializer):
    id = serializers.IntegerField()
    year = serializers.IntegerField()
    draft_name = serializers.CharField()
    drafter = serializers.CharField()
    projected_draft = None
    saved_slots = None
    locked = serializers.BooleanField()
    starting_budget = serializers.IntegerField()
    limit_qb = serializers.IntegerField()
    limit_rb = serializers.IntegerField()
    limit_wr = serializers.IntegerField()
    limit_te = serializers.IntegerField()
    limit_def = serializers.IntegerField()

class DraftListAPI(APIView):
    pagination_class = LargeResultsSetPagination
    drafts = DraftOutputSerializer(
        many=True,
        read_only=True
    )

    def get(self, request):
        drafts = DraftReadService(user=request.user).get_drafts()
        output_data = [DraftOutputSerializer.serialize(draft) for draft in drafts]
        return Response(output_data, status=status.HTTP_200_OK)
    

class DraftDetailAPI(APIView):
    pagination_class = SmallResultsSetPagination

    def get(self, request, draft_id):
        draft = DraftReadService(
            user=request.user
        ).get_draft_detail(draft_id=draft_id)
        output_data = DraftOutputSerializer.serialize(draft)
        return Response(output_data, status=status.HTTP_200_OK)
    

class DraftedPlayersDetailAPI(APIView):
    pagination_class = SmallResultsSetPagination

    class DraftDetailOutputSerializer(BaseSerializer):
        id = serializers.IntegerField()
        # year = serializers.IntegerField()
        draft_name = serializers.CharField()
        # drafter = serializers.CharField()
        # projected_draft = None
        # saved_slots = None
        # locked = serializers.BooleanField()
        # starting_budget = serializers.IntegerField()
        # limit_qb = serializers.IntegerField()
        # limit_rb = serializers.IntegerField()
        # limit_wr = serializers.IntegerField()
        # limit_te = serializers.IntegerField()
        # limit_def = serializers.IntegerField()

        class DraftedPlayersOutputSerializer(serializers.Serializer):
            # draft = DraftOutputSerializer()
            player = PlayerOutputSerializer(read_only=True)
            manager = ManagerOutputSerializer(read_only=True)
            price = serializers.IntegerField()
            created = serializers.DateTimeField()
            drafted = serializers.BooleanField()
            position_slot = serializers.CharField()
            last_update_time = serializers.DateTimeField()

            

        drafted_players = DraftedPlayersOutputSerializer(
            many=True,
            read_only=True,
            max_length = 10
        )
            # drafted_players = serializers.SerializerMethodField()
            
            # def get_drafted_players(self, instance):
            #     dps = instance.drafted_players.all().order_by('player__adp_formatted')
            #     return DraftedPlayersOutputSerializer(dps, many=True).data

    def get(self, request, draft_id):
        draft = DraftReadService(
            user=request.user
        ).get_draft_detail(draft_id=draft_id)
        output_data = self.DraftDetailOutputSerializer.serialize(draft)
        return Response(output_data, status=status.HTTP_200_OK)
    
## I'm doing this wrong.  I'm trying to paginate the draft but I should be serializing
## the draft picks and paginating those.


class DraftManagersAPI(APIView):
    year = serializers.IntegerField()
    draft_name = serializers.CharField()
    drafter = serializers.CharField()

    class DraftManagersOutputSerializer(BaseSerializer):
        id = serializers.IntegerField()
        name = serializers.CharField()
        budget = serializers.FloatField()
        drafter = serializers.BooleanField()
        position = serializers.IntegerField()

    managers = DraftManagersOutputSerializer(
        many=True,
        read_only=True
    )

    def get(self, request, draft_id):
        managers = DraftManagersReadService(
            user=request.user
        ).get(draft_id=draft_id)
        output_data = [self.DraftManagersOutputSerializer.serialize(manager) for manager in managers]
        return Response(output_data, status=status.HTTP_200_OK)


class DraftPicksOutputSerializer(BaseSerializer):
    id = serializers.IntegerField()
    price = serializers.IntegerField()
    last_update_time = serializers.DateTimeField()
    drafted = serializers.BooleanField()

    class ManagerOutputSerializer(BaseSerializer):
        name = serializers.CharField()
        position = serializers.CharField()

    manager = ManagerOutputSerializer(read_only=True)

    class PlayerOutputSerializer(BaseSerializer):
        player_id = serializers.IntegerField()
        name = serializers.CharField()
        position = serializers.CharField()
        projected_price = serializers.DecimalField(max_digits=8, decimal_places=2)
        position_price = serializers.DecimalField(max_digits=8, decimal_places=2)
        adp_price = serializers.DecimalField(max_digits=8, decimal_places=2)
        favorite = serializers.BooleanField()
        notes = serializers.CharField()
        target_type = serializers.CharField(allow_null=True, required=False)

        class NFLTeamOutputSerializer(BaseSerializer):
            code = serializers.CharField()
            name = serializers.CharField()
            short_name = serializers.CharField()
            year = serializers.IntegerField()
            early_season_qb = serializers.IntegerField()
            early_season_wr = serializers.IntegerField()
            early_season_rb = serializers.IntegerField()
            early_season_te = serializers.IntegerField()
            early_season_def = serializers.IntegerField()
            defensive_ranking = serializers.IntegerField()
        
        team = NFLTeamOutputSerializer(read_only=True)

    player = PlayerOutputSerializer(read_only=True)

    yards = serializers.IntegerField()
    tds = serializers.IntegerField()
    rush_attempts = serializers.IntegerField()
    receptions = serializers.IntegerField()
    targets = serializers.IntegerField()
    first_downs = serializers.IntegerField()
    points = serializers.DecimalField(max_digits=8, decimal_places=2)
    projected_price = serializers.DecimalField(max_digits=8, decimal_places=2)


class DraftAvailablePlayersAPI(APIView):
    def get(self, request, draft_id):
        players = DraftReadService(
            user=request.user
        ).get_available_players(draft_id=draft_id)
        # output_data = [self.AvailablePlayersOutputSerializer.serialize(player) for player in players]
        output_data = [DraftPicksOutputSerializer.serialize(player) for player in players]
        return Response(output_data, status=status.HTTP_200_OK)

class DraftPicksAPI(APIView):
    def get(self, request, draft_id):
        picks = DraftReadService(
            user=request.user
        ).get_picks(draft_id=draft_id)
        output_data = [DraftPicksOutputSerializer.serialize(pick) for pick in picks]
        return Response(output_data, status=status.HTTP_200_OK)
    
class DraftPickOutputSerializer(BaseSerializer):
    name = serializers.CharField()
    price = serializers.IntegerField()
    position = serializers.CharField()

class ManagerOutputSerializer(BaseSerializer):
    manager_name = serializers.CharField()
    manager_position = serializers.IntegerField()
    draft_picks = DraftPickOutputSerializer(
        many=True,
        read_only=True
    )

class ManagerDraftedPlayersAPI(APIView):
    def get(self, request, draft_id):
        manager_picks = DraftReadService(
            user=request.user
        ).get_manager_picks(draft_id=draft_id)
        return Response(manager_picks, status=status.HTTP_200_OK)

class DraftBudgetedPicksAPI(APIView):
    def get(self, request, draft_id):
        budgeted_picks = DraftReadService(
            user=request.user
        ).get_budgeted_picks(draft_id=draft_id)
        return Response(budgeted_picks, status=status.HTTP_200_OK)

class WatchPlayersOutputSerializer(BaseSerializer):
    player_id = serializers.IntegerField()
    name = serializers.CharField()
    position = serializers.CharField()
    projected_price = serializers.DecimalField(max_digits=8, decimal_places=2)
    favorite = serializers.BooleanField()


class DraftWatchedPicksAPI(APIView):
    def get(self, request, draft_id):
        budgeted_picks = DraftReadService(
            user=request.user
        ).get_watched_picks(draft_id=draft_id)
        output_data = [WatchPlayersOutputSerializer.serialize(pick) for pick in budgeted_picks]
        return Response(output_data, status=status.HTTP_200_OK)

class DraftBoardAPI(APIView):

    manager = serializers.CharField()
    manager_position = serializers.IntegerField()
    round = serializers.IntegerField()


    picks = DraftPickOutputSerializer(
        many=True,
        read_only=True
    )

    def get(self, request, draft_id):
        draft_board = DraftBoardReadService(
            user=request.user
        ).get(draft_id=draft_id)
        output_data = [[pick for pick in draft_round] for draft_round in draft_board]
        return Response(output_data, status=status.HTTP_200_OK)
    


class DraftSubmitPickAPI(APIView):

    class DraftPickCreateSerializer(BaseInputSerializer):
        price = serializers.IntegerField()
        position_slot = serializers.CharField()

    @extend_schema(
        parameters=None,
        request=DraftPickCreateSerializer,
        responses=None
    )
    def post(self, request, draft_id, manager_id, player_id):
        input_data = self.DraftPickCreateSerializer(data=request.data["params"]).get_input_data()
        budgeted_player = DraftReadService(
            user=request.user
        ).get_budgeted_player(
            draft_id=draft_id,
            position_slot=input_data["position_slot"],
        )
        pick, err_msg = DraftWriteService(
            user=request.user
        ).submit_pick(
            draft_id=draft_id,
            manager_id=manager_id,
            player_id=player_id,
            price=input_data["price"],
            position_slot=input_data["position_slot"],
        )
        DraftWriteService(
            user=request.user
        ).update_plan_changes(
            draft_id=draft_id,
            manager_id=manager_id,
            draft_pick=pick,
            budgeted_player=budgeted_player,
            position_slot=input_data["position_slot"],
        )
        response = Response(status=status.HTTP_200_OK)
        response.data = {"error": err_msg}
        return response

class DraftUnsubmitPickAPI(APIView):
    def post(self, request, draft_id, manager_id, player_id):
        DraftWriteService(
            user=request.user
        ).unsubmit_pick(
            draft_id=draft_id,
            manager_id=manager_id,
            player_id=player_id,
        )
        return Response(status=status.HTTP_200_OK)
    
class DraftBudgetPickAPI(APIView):
    def post(self, request, draft_id, manager_id, player_id):
        DraftWriteService(
            user=request.user
        ).budget_pick(
            draft_id=draft_id,
            manager_id=manager_id,
            player_id=player_id,
            budget_position=request.data["params"]["budget_position"],
            projected_price=request.data["params"]["projected_price"],
        )
        return Response(status=status.HTTP_200_OK)

class DraftUnbudgetPickAPI(APIView):
    def post(self, request, draft_id, manager_id, player_id):
        DraftWriteService(
            user=request.user
        ).unbudget_pick(
            draft_id=draft_id,
            manager_id=manager_id,
            player_id=player_id,
        )
        return Response(status=status.HTTP_200_OK)

class DraftReslotPicksAPI(APIView):
    def post(self, request, draft_id, manager_id):
        DraftWriteService(
            user=request.user
        ).reslot_picks(
            draft_id=draft_id,
            manager_id=manager_id,
            assignments=request.data["params"]["assignments"],
        )
        return Response(status=status.HTTP_200_OK)


class DraftReslotBudgetAPI(APIView):
    def post(self, request, draft_id, manager_id):
        DraftWriteService(
            user=request.user
        ).reslot_budget(
            draft_id=draft_id,
            manager_id=manager_id,
            assignments=request.data["params"]["assignments"],
        )
        return Response(status=status.HTTP_200_OK)


class DraftWatchPickAPI(APIView):
    def post(self, request, draft_id, manager_id, player_id):
        DraftWriteService(
            user=request.user
        ).watch_pick(
            draft_id=draft_id,
            manager_id=manager_id,
            player_id=player_id,
            watch=request.data["params"]["watch"]
        )
        return Response(status=status.HTTP_200_OK)
    
class DraftCreateAPI(APIView):
    class DraftCreateSerializer(BaseInputSerializer):
        draft_name = serializers.CharField()
        managers = serializers.CharField()
        starting_budget = serializers.IntegerField()
        limit_qb = serializers.IntegerField()
        limit_rb = serializers.IntegerField()
        limit_wr = serializers.IntegerField()
        limit_te = serializers.IntegerField()
        limit_def = serializers.IntegerField()

    @extend_schema(
        parameters=None,
        request=DraftCreateSerializer,
        responses=None
    )
    def post(self, request):
        input_data = self.DraftCreateSerializer(data=request.data["params"]).get_input_data()
        draft = DraftWriteService(
            user=request.user
        ).create_draft(
            draft_name=input_data["draft_name"],
            managers=input_data["managers"],
            # drafter=input_data["drafter"],
            starting_budget=input_data["starting_budget"],
            limit_qb=input_data["limit_qb"],
            limit_rb=input_data["limit_rb"],
            limit_wr=input_data["limit_wr"],
            limit_te=input_data["limit_te"],
            limit_def=input_data["limit_def"],
        )
        response = Response(status=status.HTTP_200_OK)
        response.data = {"id": draft.id, "year": draft.year, "draft_name": draft.draft_name, "drafter": draft.drafter, "locked": False,
                         "starting_budget": draft.starting_budget, "limit_qb": draft.limit_qb, "limit_rb": draft.limit_rb, "limit_wr": draft.limit_wr,
                         "limit_te": draft.limit_te, "limit_def": draft.limit_def}
        return response
    
class DraftDeleteAPI(APIView):
    def post(self, request, draft_id):
        DraftWriteService(
            user=request.user
        ).delete_draft(draft_id=draft_id)
        return Response(status=status.HTTP_200_OK)

class DraftFavoritePickAPI(APIView):
    def post(self, request, draft_id, player_id):
        player = DraftWriteService(
            user=request.user
        ).favorite_player(
            draft_id=draft_id,
            player_id=player_id,
            favorite=request.data["params"]["favorite"]
        )
        response = Response(status=status.HTTP_200_OK)
        response.data = {"error": "", "favorite": player.favorite}
        return response

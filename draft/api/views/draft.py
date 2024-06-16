from django.http import HttpRequest
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from core.api.serializers.base import BaseSerializer
from draft.services.draft.draft import DraftReadService, DraftManagersReadService, DraftBoardReadService

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
    name = serializers.CharField()
    budget = serializers.FloatField()
    drafter = serializers.BooleanField()
    position = serializers.IntegerField()

class DraftManagersAPI(APIView):
    year = serializers.IntegerField()
    draft_name = serializers.CharField()
    drafter = serializers.CharField()

    class DraftManagersOutputSerializer(BaseSerializer):
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
        # print(output_data)
        return Response(output_data, status=status.HTTP_200_OK)
    
class DraftBoardAPI(APIView):

    manager = serializers.CharField()
    manager_position = serializers.IntegerField()
    round = serializers.IntegerField()

    class DraftPickOutputSerializer(BaseSerializer):
        name = serializers.CharField()
        price = serializers.IntegerField()
        position = serializers.CharField()

    picks = DraftPickOutputSerializer(
        many=True,
        read_only=True
    )

    def get(self, request, draft_id):
        draft_board = DraftBoardReadService(
            user=request.user
        ).get(draft_id=draft_id)
        # output_data = [[self.DraftPickOutputSerializer.serialize(pick["pick"]) for pick in draft_round] for draft_round in draft_board]
        output_data = [[pick for pick in draft_round] for draft_round in draft_board]
        return Response(output_data, status=status.HTTP_200_OK)
    
    # def get(self, request, draft_id):
    #     draft_board = DraftBoardReadService(
    #         user=request.user
    #     ).get(draft_id=draft_id)
    #     output_data = []
    #     for draft_round in draft_board:
    #         print(draft_round)
    #         round_picks = []
    #         for pick in draft_round:
    #             print(pick)
    #             serialized_pick = self.DraftPickOutputSerializer.serialize(pick)
    #             print(serialized_pick)
    #             round_picks.append(serialized_pick)
    #         output_data.append(round_picks)
    #     output_data = [[self.DraftPickOutputSerializer.serialize(pick) for pick in draft_round] for draft_round in draft_board]
    #     print(output_data)
    #     return Response(output_data, status=status.HTTP_200_OK)


class DraftDetailAPI(APIView):
    pagination_class = SmallResultsSetPagination

    class DraftDetailOutputSerializer(BaseSerializer):
        # year = serializers.IntegerField()
        # draft_name = serializers.CharField()
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
    

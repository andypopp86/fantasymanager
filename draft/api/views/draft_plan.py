from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import extend_schema

from core.api.serializers.base import BaseSerializer, BaseInputSerializer
from draft.api.permissions import IsDrafter
from draft.services.draft.draft_plan import DraftPlanReadService, DraftPlanWriteService


class DraftPlanPlayerOutputSerializer(BaseSerializer):
    id = serializers.IntegerField()
    player_id = serializers.IntegerField()
    name = serializers.CharField()
    position = serializers.CharField()
    projected_price = serializers.DecimalField(max_digits=8, decimal_places=2)
    override_price = serializers.DecimalField(max_digits=8, decimal_places=2)


class DraftPlanOutputSerializer(BaseSerializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    year = serializers.IntegerField()
    date_created = serializers.DateTimeField()
    slots = serializers.SerializerMethodField()
    # A sibling of `slots`, not a key inside it, so nothing reading the old
    # shape has to change: slot -> a fixed-length shelf (BACKUP_DEPTH), each
    # cell the alternate parked there or null.
    backups = serializers.SerializerMethodField()

    def get_slots(self, instance):
        return {
            slot: DraftPlanPlayerOutputSerializer.serialize(player) if player else None
            for slot, player in instance.slot_players().items()
        }

    def get_backups(self, instance):
        return {
            slot: [
                DraftPlanPlayerOutputSerializer.serialize(cell.player) if cell else None
                for cell in shelf
            ]
            for slot, shelf in instance.slot_backups().items()
        }


class DraftPlanListAPI(APIView):
    permission_classes = [IsDrafter]

    def get(self, request):
        plans = DraftPlanReadService(
            user=request.user
        ).get_plans(year=request.query_params.get('year'))
        output_data = [DraftPlanOutputSerializer.serialize(plan) for plan in plans]
        return Response(output_data, status=status.HTTP_200_OK)


class DraftPlanDetailAPI(APIView):
    permission_classes = [IsDrafter]

    def get(self, request, plan_id):
        plan = DraftPlanReadService(
            user=request.user
        ).get_plan(plan_id=plan_id)
        output_data = DraftPlanOutputSerializer.serialize(plan)
        return Response(output_data, status=status.HTTP_200_OK)


class DraftPlanCreateFromDraftAPI(APIView):
    permission_classes = [IsDrafter]

    class DraftPlanCreateSerializer(BaseInputSerializer):
        name = serializers.CharField()
        # Off by default: without it, re-using a (year, name) is a 409 so the
        # client can ask before replacing a plan.
        overwrite = serializers.BooleanField(default=False)

    @extend_schema(
        parameters=None,
        request=DraftPlanCreateSerializer,
        responses=None
    )
    def post(self, request, draft_id):
        input_data = self.DraftPlanCreateSerializer(data=request.data["params"]).get_input_data()
        plan = DraftPlanWriteService(
            user=request.user
        ).create_from_draft(
            draft_id=draft_id,
            name=input_data["name"],
            overwrite=input_data["overwrite"],
        )
        output_data = DraftPlanOutputSerializer.serialize(plan)
        return Response(output_data, status=status.HTTP_201_CREATED)


class DraftPlanDeleteAPI(APIView):
    permission_classes = [IsDrafter]

    def post(self, request, plan_id):
        DraftPlanWriteService(
            user=request.user
        ).delete_plan(plan_id=plan_id)
        return Response(status=status.HTTP_200_OK)

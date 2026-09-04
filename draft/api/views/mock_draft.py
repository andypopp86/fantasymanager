from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import extend_schema

from core.api.serializers.base import BaseSerializer, BaseInputSerializer
from draft.api.permissions import IsDrafter
from draft.api.views.draft_plan import DraftPlanOutputSerializer
from draft.models import ALLOWED_POSITIONS, BACKUP_DEPTH, DRAFT_PLAN_SLOTS
from draft.services.draft.draft_plan import DraftPlanWriteService
from draft.services.draft.mock_draft import MockDraftReadService, MockDraftWriteService


class MockPickOutputSerializer(BaseSerializer):
    """One filled slot. `price` is the mock's own number (what the roster is
    budgeted at); `projected_price` is the player's effective market price, so
    the UI can show what the pick costs against what it's worth."""
    id = serializers.IntegerField()
    player_id = serializers.IntegerField(source='player.player_id')
    name = serializers.CharField(source='player.name')
    position = serializers.CharField(source='player.position')
    team = serializers.CharField(source='player.team.code', allow_null=True, default=None)
    price = serializers.IntegerField()
    projected_price = serializers.SerializerMethodField()
    # Risk follows the player into the slot: the roster is where you weigh the
    # shape of the plan, so the score has to be readable there and not only in
    # the list you picked from. 0 = not reviewed, and renders as nothing.
    risk_score = serializers.IntegerField(source='player.risk_score')
    risk_summary = serializers.CharField(source='player.risk_summary', allow_null=True, allow_blank=True)

    def get_projected_price(self, instance):
        player = instance.player
        return player.override_price if player.override_price is not None else player.projected_price


class MockBackupOutputSerializer(BaseSerializer):
    """One cell of a slot's shelf. No `price`: an alternate is a candidate, not
    a commitment, so only the market price is worth showing."""
    id = serializers.IntegerField()
    player_id = serializers.IntegerField(source='player.player_id')
    name = serializers.CharField(source='player.name')
    position = serializers.CharField(source='player.position')
    team = serializers.CharField(source='player.team.code', allow_null=True, default=None)
    rank = serializers.IntegerField()
    projected_price = serializers.SerializerMethodField()

    def get_projected_price(self, instance):
        player = instance.player
        return player.override_price if player.override_price is not None else player.projected_price


class MockDraftListOutputSerializer(BaseSerializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    year = serializers.IntegerField()
    starting_budget = serializers.IntegerField()
    budget_spent = serializers.IntegerField()
    budget_remaining = serializers.IntegerField()
    filled_slots = serializers.SerializerMethodField()
    total_slots = serializers.SerializerMethodField()
    date_created = serializers.DateTimeField()
    last_update_time = serializers.DateTimeField()

    def get_filled_slots(self, instance):
        return len(instance.picks.all())

    def get_total_slots(self, instance):
        return len(DRAFT_PLAN_SLOTS)


class MockDraftDetailOutputSerializer(MockDraftListOutputSerializer):
    """The list payload plus every slot, filled or not — the same
    slot/allowed_positions shape the budget panel uses, so the client can guard
    eligibility without a second lookup."""
    slots = serializers.SerializerMethodField()

    def get_slots(self, instance):
        backups = instance.slot_backups()
        return {
            slot: {
                'order': order,
                'allowed_positions': ALLOWED_POSITIONS.get(slot, []),
                'pick': MockPickOutputSerializer.serialize(pick) if pick else None,
                # Always BACKUP_DEPTH long, empty cells included, so the client
                # renders a fixed set of columns without padding it itself.
                'backups': [
                    MockBackupOutputSerializer.serialize(cell) if cell else None
                    for cell in backups.get(slot, [None] * BACKUP_DEPTH)
                ],
            }
            for order, (slot, pick) in enumerate(instance.slot_picks().items())
        }


class MockDraftPlayerOutputSerializer(BaseSerializer):
    player_id = serializers.IntegerField()
    name = serializers.CharField()
    position = serializers.CharField()
    team = serializers.CharField(source='team.code', allow_null=True, default=None)
    # Integer RANK (1 = first off the board), not a decimal round.pick.
    adp_formatted = serializers.IntegerField()
    favorite = serializers.BooleanField(allow_null=True)
    target_tier = serializers.IntegerField()
    years_experience = serializers.IntegerField()
    my_price = serializers.DecimalField(max_digits=8, decimal_places=2, allow_null=True)
    # Annotated on the queryset: override_price when set, else projected_price.
    projected_price = serializers.DecimalField(max_digits=8, decimal_places=2, source='effective_price')
    # Hand-scored 1-10, higher = riskier; 0 means NOT REVIEWED and renders as
    # nothing. The summary rides along for the badge's tooltip, same as the
    # board's — one bullet per line.
    risk_score = serializers.IntegerField()
    risk_summary = serializers.CharField(allow_null=True, allow_blank=True)


class MockDraftListAPI(APIView):
    permission_classes = [IsDrafter]

    def get(self, request):
        mocks = MockDraftReadService(
            user=request.user
        ).get_mock_drafts(year=request.query_params.get('year'))
        output_data = [MockDraftListOutputSerializer.serialize(mock) for mock in mocks]
        return Response(output_data, status=status.HTTP_200_OK)


class MockDraftDetailAPI(APIView):
    permission_classes = [IsDrafter]

    def get(self, request, mock_draft_id):
        mock = MockDraftReadService(
            user=request.user
        ).get_mock_draft(mock_draft_id=mock_draft_id)
        output_data = MockDraftDetailOutputSerializer.serialize(mock)
        return Response(output_data, status=status.HTTP_200_OK)


class MockDraftAvailablePlayersAPI(APIView):
    permission_classes = [IsDrafter]

    def get(self, request, mock_draft_id):
        players = MockDraftReadService(
            user=request.user
        ).get_available_players(mock_draft_id=mock_draft_id)
        output_data = [MockDraftPlayerOutputSerializer.serialize(player) for player in players]
        return Response(output_data, status=status.HTTP_200_OK)


class MockDraftCreateAPI(APIView):
    permission_classes = [IsDrafter]

    class MockDraftCreateSerializer(BaseInputSerializer):
        name = serializers.CharField()
        starting_budget = serializers.IntegerField(default=200)
        year = serializers.IntegerField(required=False, allow_null=True)

    @extend_schema(
        parameters=None,
        request=MockDraftCreateSerializer,
        responses=None
    )
    def post(self, request):
        input_data = self.MockDraftCreateSerializer(data=request.data["params"]).get_input_data()
        mock = MockDraftWriteService(
            user=request.user
        ).create_mock_draft(
            name=input_data["name"],
            starting_budget=input_data["starting_budget"],
            year=input_data.get("year"),
        )
        output_data = MockDraftDetailOutputSerializer.serialize(mock)
        return Response(output_data, status=status.HTTP_201_CREATED)


class MockDraftDeleteAPI(APIView):
    permission_classes = [IsDrafter]

    def post(self, request, mock_draft_id):
        MockDraftWriteService(
            user=request.user
        ).delete_mock_draft(mock_draft_id=mock_draft_id)
        return Response(status=status.HTTP_200_OK)


class MockDraftSetPickAPI(APIView):
    permission_classes = [IsDrafter]

    class MockPickCreateSerializer(BaseInputSerializer):
        position_slot = serializers.CharField()
        price = serializers.IntegerField()

    @extend_schema(
        parameters=None,
        request=MockPickCreateSerializer,
        responses=None
    )
    def post(self, request, mock_draft_id, player_id):
        input_data = self.MockPickCreateSerializer(data=request.data["params"]).get_input_data()
        MockDraftWriteService(
            user=request.user
        ).set_pick(
            mock_draft_id=mock_draft_id,
            player_id=player_id,
            position_slot=input_data["position_slot"],
            price=input_data["price"],
        )
        mock = MockDraftReadService(
            user=request.user
        ).get_mock_draft(mock_draft_id=mock_draft_id)
        return Response(MockDraftDetailOutputSerializer.serialize(mock), status=status.HTTP_200_OK)


class MockDraftClearSlotAPI(APIView):
    permission_classes = [IsDrafter]

    class MockPickClearSerializer(BaseInputSerializer):
        position_slot = serializers.CharField()

    @extend_schema(
        parameters=None,
        request=MockPickClearSerializer,
        responses=None
    )
    def post(self, request, mock_draft_id):
        input_data = self.MockPickClearSerializer(data=request.data["params"]).get_input_data()
        MockDraftWriteService(
            user=request.user
        ).clear_slot(
            mock_draft_id=mock_draft_id,
            position_slot=input_data["position_slot"],
        )
        mock = MockDraftReadService(
            user=request.user
        ).get_mock_draft(mock_draft_id=mock_draft_id)
        return Response(MockDraftDetailOutputSerializer.serialize(mock), status=status.HTTP_200_OK)


class MockDraftSetBackupAPI(APIView):
    permission_classes = [IsDrafter]

    class MockBackupCreateSerializer(BaseInputSerializer):
        position_slot = serializers.CharField()
        rank = serializers.IntegerField()

    @extend_schema(
        parameters=None,
        request=MockBackupCreateSerializer,
        responses=None
    )
    def post(self, request, mock_draft_id, player_id):
        input_data = self.MockBackupCreateSerializer(data=request.data["params"]).get_input_data()
        MockDraftWriteService(
            user=request.user
        ).set_backup(
            mock_draft_id=mock_draft_id,
            player_id=player_id,
            position_slot=input_data["position_slot"],
            rank=input_data["rank"],
        )
        mock = MockDraftReadService(
            user=request.user
        ).get_mock_draft(mock_draft_id=mock_draft_id)
        return Response(MockDraftDetailOutputSerializer.serialize(mock), status=status.HTTP_200_OK)


class MockDraftClearBackupAPI(APIView):
    permission_classes = [IsDrafter]

    class MockBackupClearSerializer(BaseInputSerializer):
        position_slot = serializers.CharField()
        rank = serializers.IntegerField()

    @extend_schema(
        parameters=None,
        request=MockBackupClearSerializer,
        responses=None
    )
    def post(self, request, mock_draft_id):
        input_data = self.MockBackupClearSerializer(data=request.data["params"]).get_input_data()
        MockDraftWriteService(
            user=request.user
        ).clear_backup(
            mock_draft_id=mock_draft_id,
            position_slot=input_data["position_slot"],
            rank=input_data["rank"],
        )
        mock = MockDraftReadService(
            user=request.user
        ).get_mock_draft(mock_draft_id=mock_draft_id)
        return Response(MockDraftDetailOutputSerializer.serialize(mock), status=status.HTTP_200_OK)


class MockDraftCreatePlanAPI(APIView):
    """Turn a mock draft's slots into a standalone DraftPlan — the reason
    MockDraft exists (no empty Draft needed to get a plan)."""

    permission_classes = [IsDrafter]

    class MockDraftPlanCreateSerializer(BaseInputSerializer):
        name = serializers.CharField()
        # See DraftPlanCreateFromDraftAPI: a taken (year, name) answers 409
        # unless the client has confirmed the overwrite.
        overwrite = serializers.BooleanField(default=False)

    @extend_schema(
        parameters=None,
        request=MockDraftPlanCreateSerializer,
        responses=None
    )
    def post(self, request, mock_draft_id):
        input_data = self.MockDraftPlanCreateSerializer(data=request.data["params"]).get_input_data()
        plan = DraftPlanWriteService(
            user=request.user
        ).create_from_mock_draft(
            mock_draft_id=mock_draft_id,
            name=input_data["name"],
            overwrite=input_data["overwrite"],
        )
        return Response(DraftPlanOutputSerializer.serialize(plan), status=status.HTTP_201_CREATED)

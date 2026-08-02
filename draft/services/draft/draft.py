from django.http import Http404
from rest_framework.exceptions import ValidationError

from core.services.base import BaseService
from django.db import transaction
from django.db.models import F, Case, When
from django.utils import timezone

from draft import models as d


def validate_slot_eligibility(player, position_slot):
    """Return an error message if `player` may not occupy `position_slot`, else None.

    With auto-slotting removed, the slot is chosen by the user (drag target), so the
    server guards that the drop is legal per ALLOWED_POSITIONS.
    """
    if position_slot not in dict(d.BUDGET_POSITIONS):
        return f"Invalid slot '{position_slot}'"
    allowed = d.ALLOWED_POSITIONS.get(position_slot, ())
    if player and player.position not in allowed:
        return f"{player.name} ({player.position}) is not eligible for slot {position_slot}"
    return None

class DraftManagersReadService(BaseService):

    def get(
        self,
        draft_id
    ):
        managers = d.Manager.objects.filter(draft_id=draft_id).order_by("position")
        if not managers:
            raise Http404
        return managers
    
class DraftBoardReadService(BaseService):
    def get(self, draft_id):
        draft = d.Draft.objects.filter(id=draft_id).first()
        if not draft:
            raise Http404
        return draft.draft_rounds()


class DraftWriteService(BaseService):
    def create_draft(self, draft_name, managers, starting_budget, limit_qb, limit_rb, limit_wr, limit_te, limit_def, available_to_spectators=False):
        year = timezone.now().year
        draft = d.Draft(
            year=year,
            draft_name=draft_name,
            starting_budget=starting_budget,
            limit_qb=limit_qb,
            limit_rb=limit_rb,
            limit_wr=limit_wr,
            limit_te=limit_te,
            limit_def=limit_def,
            available_to_spectators=available_to_spectators
        )
        draft_managers = []
        for idx, manager_name in enumerate(managers.split("\n")):
            manager = d.Manager(
                draft=draft,
                name=manager_name.replace("*", "").strip(),
                budget=starting_budget,
                position=idx,
                drafter=True if "*" in manager_name else False
            )
            if "*" in manager_name:
                draft.drafter = manager_name.replace("*", "").strip()
                draft.save()
            draft_managers.append(manager)
        d.Manager.objects.bulk_create(draft_managers)
        players = d.Player.objects.filter(year=draft.year)
        draft_picks = [d.DraftPick(draft=draft, player=player) for player in players]
        d.DraftPick.objects.bulk_create(draft_picks)
        return draft
    
    def delete_draft(self, draft_id):
        draft = d.Draft.objects.filter(id=draft_id).first()
        if not draft:
            raise Http404
        if not draft.locked:
            draft.delete()
        else:
            raise Exception("Draft is locked")
        return draft
    
    def update_plan_changes(self, draft_id, manager_id, draft_pick, budgeted_player, position_slot):
        # draft_pick is None when submit_pick failed; nothing to record then.
        if draft_pick is None:
            return
        manager = d.Manager.objects.filter(id=manager_id).first()
        if not manager.drafter:
            return
        draft = d.Draft.objects.filter(id=draft_id).first()
        if budgeted_player and (draft_pick.player_id != budgeted_player.player_id):
            # PlanChange is unique per (draft, position); re-drafting a slot must
            # overwrite the prior record rather than raise IntegrityError.
            d.PlanChange.objects.update_or_create(
                draft=draft,
                position=position_slot,
                defaults={
                    "draft_pick": draft_pick,
                    "budget_pick": budgeted_player,
                },
            )
            


    def submit_pick(self, draft_id, manager_id, player_id, price, position_slot):
        draft = d.Draft.objects.filter(id=draft_id).first()
        player_id_int = int(player_id)
        if not draft:
            raise Http404
        manager = d.Manager.objects.filter(id=manager_id).first()
        existing_pick = d.DraftPick.objects.filter(draft_id=draft_id, position_slot=position_slot, manager=manager).first()
        if existing_pick:
            return None, f"Position {position_slot} already taken by {existing_pick.player.name}"
        player = d.Player.objects.filter(year=draft.year, player_id=player_id_int).first()
        elig_err = validate_slot_eligibility(player, position_slot)
        if elig_err:
            return None, elig_err
        pick = d.DraftPick.objects.filter(draft_id=draft_id, player=player).first()
        if not pick:
            pick = d.DraftPick(draft_id=draft_id, player_id=player_id_int)
        pick.drafted = True
        pick.manager = manager
        pick.price = price
        pick.position_slot = position_slot
        pick.last_update_time = timezone.now()
        pick.save()
        manager.budget -= price
        manager.save(update_fields=['budget'])
        return pick, None
    
    def unsubmit_pick(self, draft_id, manager_id, player_id):
        draft = d.Draft.objects.filter(id=draft_id).first()
        player = d.Player.objects.filter(year=draft.year, player_id=player_id).first()
        manager = d.Manager.objects.filter(id=manager_id).first()
        pick = d.DraftPick.objects.filter(draft=draft, manager=manager, player=player).first()
        if not pick:
            raise Http404
        manager = d.Manager.objects.filter(id=manager_id).first()
        manager.budget += pick.price
        manager.save(update_fields=['budget'])
        pick.drafted = False
        pick.manager = None
        pick.price = 0
        pick.position_slot = None
        pick.save()
        return pick

    def budget_pick(self, draft_id, manager_id, player_id, budget_position, projected_price):
        draft = d.Draft.objects.filter(id=draft_id).first()
        player = d.Player.objects.filter(year=draft.year, player_id=player_id).first()
        elig_err = validate_slot_eligibility(player, budget_position)
        if elig_err:
            raise ValidationError(elig_err)
        pick, _ = d.BudgetPlayer.objects.get_or_create(draft_id=draft_id, manager_id=manager_id, player=player)
        pick.price = int(float(projected_price))
        pick.position = budget_position
        pick.status = 'budgeted'
        pick.save()
        return pick

    def unbudget_pick(self, draft_id, manager_id, player_id):
        draft = d.Draft.objects.filter(id=draft_id).first()
        player = d.Player.objects.filter(year=draft.year, player_id=player_id).first()
        pick, _ = d.BudgetPlayer.objects.get_or_create(draft_id=draft_id, manager_id=manager_id, player=player)
        pick.manager = None
        pick.price = 0
        pick.position = None
        pick.status = 'none'
        pick.save()
        return pick
    
    def favorite_player(self, draft_id, player_id, favorite):
        draft = d.Draft.objects.filter(id=draft_id).first()
        player = d.Player.objects.filter(year=draft.year, player_id=player_id).first()
        player.favorite = bool(favorite)
        player.save()
        return player
    
    def reslot_picks(self, draft_id, manager_id, assignments):
        """Rewrite a manager's drafted picks into the given {slot: player_id} layout.

        Slots are cleared first so the reassignment can't collide with a slot the
        same player is vacating. Ineligible pairings (per ALLOWED_POSITIONS) are skipped.
        """
        picks = d.DraftPick.objects.filter(draft_id=draft_id, manager_id=manager_id, drafted=True)
        picks_by_player = {pick.player.player_id: pick for pick in picks}
        with transaction.atomic():
            picks.update(position_slot=None)
            for slot, player_id in assignments.items():
                pick = picks_by_player.get(int(player_id))
                if pick is None or validate_slot_eligibility(pick.player, slot):
                    continue
                pick.position_slot = slot
                pick.save(update_fields=['position_slot'])

    def reslot_budget(self, draft_id, manager_id, assignments):
        """Rewrite a manager's budgeted players into the given {slot: player_id} layout."""
        bpicks = d.BudgetPlayer.objects.filter(draft_id=draft_id, manager_id=manager_id, status='budgeted')
        bpicks_by_player = {bpick.player.player_id: bpick for bpick in bpicks}
        with transaction.atomic():
            bpicks.update(position=None)
            for slot, player_id in assignments.items():
                bpick = bpicks_by_player.get(int(player_id))
                if bpick is None or validate_slot_eligibility(bpick.player, slot):
                    continue
                bpick.position = slot
                bpick.save(update_fields=['position'])

    def watch_pick(self, draft_id, manager_id, player_id, watch):
        draft = d.Draft.objects.filter(id=draft_id).first()
        d.Player.objects.filter(year=draft.year, player_id=player_id).update(watched=bool(watch))
        # manager = d.Manager.objects.filter(id=manager_id).first()
        # pick, created = d.WatchPick.objects.update_or_create(
        #     draft=draft,
        #     manager=manager,
        #     player=player,
        #     defaults={'watched': bool(watch)}
        # )
        # if not created:
        #     pick.watched = bool(watch)
        #     pick.save()


class DraftReadService(BaseService):

    def get_draft_detail(
        self,
        draft_id
    ):
        draft = d.Draft.objects.filter(id=draft_id).first()
        if not draft:
            raise Http404
        return draft
    
    def get_drafts(self):
        drafts = d.Draft.objects.all().order_by("-year", "-date_created", "draft_name")
        # Spectators (non-staff) only see drafts explicitly flagged for them.
        if not (self.user and getattr(self.user, "is_staff", False)):
            drafts = drafts.filter(available_to_spectators=True)
        return drafts
    
    def get_picks(self, draft_id):
        picks = d.DraftPick.objects.filter(draft_id=draft_id).order_by("manager__name", "-price")
        return picks

    def get_spectator_drafts(self):
        return d.Draft.objects.filter(
            available_to_spectators=True,
        ).order_by("-year", "-date_created", "draft_name")

    def get_drafted_players(self, draft_id):
        if not d.Draft.objects.filter(id=draft_id).exists():
            raise Http404
        return d.DraftPick.objects.filter(
            draft_id=draft_id, drafted=True,
        ).select_related("player", "manager").order_by("manager__position", "last_update_time")
    
    def get_available_players(self, draft_id):
        picks = d.DraftPick.objects.filter(draft_id=draft_id, drafted=False)
        # picks = picks.select_related("player__player_stats")
        POINTS_PER_YARD = 0.1
        POINTS_PER_TD = 6
        picks = picks.annotate(
            yards=F("player__player_stats__rush_yards") + F("player__player_stats__receiving_yards"),
            tds=F("player__player_stats__tds"),
            rush_attempts=F("player__player_stats__rush_attempts"),
            receptions=F("player__player_stats__receptions"),
            targets=F("player__player_stats__targets"),
            first_downs=F("player__player_stats__first_downs"),
            points=F("yards") * POINTS_PER_YARD + F("tds") * POINTS_PER_TD,
            projected_price=Case(
                When(player__override_price__isnull=False, then=F("player__override_price")),
                default=F("player__projected_price"),
            )
        )
        picks = picks.order_by("-player__projected_price", "-player__favorite")
        return picks
    
    def get_budgeted_picks(self, draft_id):
        from draft.models import POSITIONS, ALLOWED_POSITIONS
        budget_map = {pos_name: {
            "id": "",
            "order": pos_idx,
            "pick": {
                "name": "",
                "position": "",
                "player_id": "",
                "player_name": "",
                "pick_id": "",
                "projected_price": 0,
                "price": 0,
                "budget_position": "",
                "status": "",
            },
            "allowed_positions": ALLOWED_POSITIONS.get(pos_name, [])
            } for pos_idx, pos_name in POSITIONS}
        budget_picks = d.BudgetPlayer.objects.filter(draft_id=draft_id, status="budgeted").order_by("manager__name", "-price")
        pick_player_id_list = [pick.player_id for pick in budget_picks]
        draft_picks = d.DraftPick.objects.filter(draft_id=draft_id, drafted=True, player_id__in=pick_player_id_list).order_by("manager__name", "-price")
        actual_prices = {pick.player_id: pick.price for pick in draft_picks}
        for bpick in budget_picks:
            if bpick.position in budget_map:
                budget_map[bpick.position]["pick"]["id"] = bpick.id
                budget_map[bpick.position]["pick"]["player_id"] = bpick.player.player_id
                budget_map[bpick.position]["pick"]["player_name"] = bpick.player.name
                budget_map[bpick.position]["pick"]["position"] = bpick.player.position
                budget_map[bpick.position]["pick"]["projected_price"] = bpick.player.override_price or bpick.player.projected_price
                budget_map[bpick.position]["pick"]["actual_price"] = actual_prices.get(bpick.player.player_id, 0)
                budget_map[bpick.position]["pick"]["budget_position"] = bpick.position
                budget_map[bpick.position]["pick"]["status"] = bpick.status
        ordered_budget_map = {k: v for k, v in sorted(budget_map.items(), key=lambda item: item[1]['order'])}
        return ordered_budget_map
    
    def get_manager_picks(self, draft_id):
        picks = d.DraftPick.objects.filter(draft_id=draft_id, drafted=True, position_slot__isnull=False).order_by('manager__position').distinct()
        managers = d.Manager.objects.filter(draft_id=draft_id).order_by('position')
        manager_dict = {}
        for man in managers:
            if man.id not in manager_dict:
                manager_dict[man.id] = {'manager_id':man.id, 'manager_name': man.name, 'manager_position': man.position, 'manager_budget': man.budget,
                                        'is_drafter': man.drafter,
                                        'draft_picks': { pos_code:
                                            {
                                            "pick": {
                                                "name":"-",
                                                "position": "",
                                                "player_id": "",
                                                "pick_id": "",
                                                "projected_price": 0,
                                                "price":0,
                                            },
                                            # "order": pos_idx,                                    
                                            "position_slot": pos_code,
                                            "allowed_positions": d.ALLOWED_POSITIONS.get(pos_code, [])
                                            } for pos_code, _ in d.BUDGET_POSITIONS}}
        man_pick_ct = 0
        cur_man_id = None
        for pick in picks:
            if cur_man_id != pick.manager.id:
                man_pick_ct = 0
                cur_man_id = pick.manager.id
            manager_dict[cur_man_id]['draft_picks'][pick.position_slot]["pick"]["name"] = pick.player.name
            manager_dict[cur_man_id]['draft_picks'][pick.position_slot]["pick"]["price"] = pick.price
            manager_dict[cur_man_id]['draft_picks'][pick.position_slot]["pick"]["position"] = pick.player.position
            manager_dict[cur_man_id]['draft_picks'][pick.position_slot]["pick"]["player_id"] = pick.player.player_id
            manager_dict[cur_man_id]['draft_picks'][pick.position_slot]["pick"]["pick_id"] = pick.id
            manager_dict[cur_man_id]['draft_picks'][pick.position_slot]["pick"]["projected_price"] = pick.player.projected_price
            manager_dict[cur_man_id]['draft_picks'][pick.position_slot]["position_slot"] = pick.position_slot

            man_pick_ct += 1

        manager_list = []
        for man_id, manager_dict in manager_dict.items():
            manager_list.append(manager_dict)
        return manager_list
    
    def get_watched_picks(self, draft_id):
        draft = d.Draft.objects.filter(id=draft_id).first()
        watched_players = d.Player.objects.filter(year=draft.year, watched=True).order_by("-projected_price")
        return watched_players
    
    def get_budgeted_player(self, draft_id, position_slot):
        return d.BudgetPlayer.objects.filter(draft_id=draft_id, position=position_slot).first()


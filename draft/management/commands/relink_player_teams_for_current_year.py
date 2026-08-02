from django.core.management.base import BaseCommand
from django.utils import timezone

from draft import models as d
from draft.management.commands.add_players import get_or_create_team


class Command(BaseCommand):
    help = ("Repoint the current year's players at the current year's NFLTeam "
            "rows (matched by code). Cleans up links left by the old "
            "unfiltered team lookup and by players who fell off the FFC feed "
            "(refresh_player_adp only relinks players present in the feed).")

    def handle(self, *args, **options):
        this_year = timezone.now().year
        stale = d.Player.objects.filter(
            year=this_year, team__isnull=False,
        ).exclude(team__year=this_year).select_related('team')
        relinked = 0
        for player in stale:
            old_year = player.team.year
            player.team = get_or_create_team(player.team.code, this_year)
            player.save(update_fields=['team'])
            relinked += 1
            self.stdout.write(f'  {player.name} ({player.position}): {player.team.code} {old_year} -> {this_year}')
        self.stdout.write(self.style.SUCCESS(
            f'relinked {relinked} players to {this_year} team rows'))

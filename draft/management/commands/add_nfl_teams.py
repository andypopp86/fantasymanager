from django.core.management.base import BaseCommand
from django.utils import timezone

from draft import models as d
from draft.management.commands.add_players import get_data, get_or_create_team


class Command(BaseCommand):
    help = ("Create the current year's NFLTeam rows from the Fantasy Football "
            "Calculator ADP API. Idempotent. Optional since add_players now "
            "creates missing team rows itself; kept for seeding teams alone.")

    def handle(self, *args, **options):
        this_year = timezone.now().year
        data = get_data(this_year)
        codes = {p['team'] for p in data['players'] if p.get('team')}

        before = d.NFLTeam.objects.filter(year=this_year).count()
        for code in sorted(codes):
            get_or_create_team(code, this_year)
        created = d.NFLTeam.objects.filter(year=this_year).count() - before
        self.stdout.write(self.style.SUCCESS(
            f'{len(codes)} team codes from FFC for {this_year}: '
            f'{created} created, {len(codes) - created} already existed'))

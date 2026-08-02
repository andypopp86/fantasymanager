import logging
logger = logging.getLogger(__name__)

from django.core.management.base import BaseCommand
from django.utils import timezone

from draft import models as d
from draft.management.commands.add_players import (
    compute_average_adp_prices,
    get_data,
    load_ffc_json,
)


class Command(BaseCommand):
    help = ('Re-pull ADP from Fantasy Football Calculator and refresh players, '
            'projected prices, and NFL team links for the current year. '
            'Same import as add_players (kept as the in-season alias).')

    def handle(self, *args, **options):
        this_year = timezone.now().year
        d.Player.objects.filter(position='PK').delete()
        average_adp_prices = compute_average_adp_prices()
        data = get_data(this_year)
        load_ffc_json(average_adp_prices, this_year, data)
        self.stdout.write(self.style.SUCCESS(
            f'refreshed {len(data["players"])} FFC rows for {this_year}'))

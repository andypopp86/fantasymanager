import logging
import csv
logger = logging.getLogger(__name__)

from django.core.management.base import BaseCommand
from django.utils import timezone

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'
    # manage.py print_draft_by_order --draft 27 --order created:asc
    # manage.py print_draft_by_order --draft 27 --manager Gill --order 

    def handle(self, *args, **options):
        players = d.Player.objects.all()
        with open('player_ids.csv', 'w', newline="") as csvfile:
            fieldnames = ['id', 'player_id', 'name']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            for player in players:
                writer.writerow({'id': player.id, 'player_id': player.player_id, 'name': player.name})

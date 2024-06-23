import logging
logger = logging.getLogger(__name__)

from django.core.management.base import BaseCommand, CommandError

from django.db.models import Q

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        pass

    def handle(self, *args, **options):
        assigned = []
        unassigned = []
        historical_picks = d.HistoricalDraftPicks.objects.filter(historical_stat__isnull=True).order_by('-price')
        for hp in historical_picks:
            try:
                hp.historical_stat = d.HistoricalPlayerStats.objects.get(
                    Q(year=hp.year) & 
                    (Q(player_name__iexact=hp.player) | Q(player__nickname=hp.player))
                    )
                hp.save()
                assigned.append(hp)
                logger.info(hp, 'saved')
            except Exception as exc:
                logger.info(exc)
                unassigned.append(hp)
                logger.info(hp, 'not saved')

        with open('assigned_players.txt', 'w') as f:
            for assignee in assigned:
                f.write('%s\t%s\n' % (assignee.year, assignee.player))

        with open('unassigned_players.txt', 'w') as f:
            for assignee in unassigned:
                f.write('%s\t%s\n' % (assignee.year, assignee.player))



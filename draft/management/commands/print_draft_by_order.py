import logging
logger = logging.getLogger(__name__)

from django.core.management.base import BaseCommand
from django.utils import timezone

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'
    # manage.py print_draft_by_order --draft 27 --order created:asc
    # manage.py print_draft_by_order --draft 27 --manager Gill --order last_update_time:asc

    def add_arguments(self, parser):
        parser.add_argument('--draft', action='store', type=int, dest='draft_id')

        parser.add_argument('--order', action='store', dest='order', default='price:desc')
        parser.add_argument('--manager', action='store', dest='manager', default="")
        parser.add_argument('--position', action='store', dest='position', default="")

    def handle(self, *args, **options):
        this_year = timezone.now().year
        mgr = options["manager"]
        pos = options["position"]
        draft = d.Draft.objects.filter(id=options['draft_id']).first()
        if not draft:
            logger.info('NO SUCH DRAFT')
        sort_field, sort_direction = options["order"].split(":")
        sort_direction = "-" if sort_direction == "desc" else ""
        picks = draft.drafted_players.filter(drafted=True)
        # picks = picks.filter(manager__name=options['manager']) if options['manager'] else picks
        # picks = picks.filter(player__position=options['position']) if options['position'] else picks
        picks = picks.order_by(f"{sort_direction}{sort_field}")

        for idx, pick in enumerate(picks, start=1):
            if (not mgr or mgr == pick.manager.name) \
                and (not pos or pos == pick.player.position):
                elems = [str(idx), f"${str(pick.price)}", pick.player.position, pick.manager.name, pick.player.name, pick.last_update_time.strftime("%H:%M:%S")]
                logger.info("\t".join(elems))


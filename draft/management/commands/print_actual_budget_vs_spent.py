from django.core.management.base import BaseCommand

from django.utils import timezone

from draft import models as d

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--draft', action='store', type=int, dest='draft_id', default=None)

    def handle(self, *args, **options):
        this_year = timezone.now().year
        draft = d.Draft.objects.filter(id=options['draft_id']).first()
        if not draft:
            print('NO SUCH DRAFT')
        
        ranks = []
        for manager in draft.managers.all():
            actuals = []
            projects = []
            diffs = []
            for pick in manager.manager_players.filter(drafted=True):
                actuals.append(pick.price)
                projects.append(pick.projected_price())
                diffs.append(pick.price - pick.projected_price())
                print(manager.name, pick, pick.price, pick.projected_price())
            
            sum_act = sum(actuals)
            sum_proj = sum(projects)
            sum_diffs = sum(diffs)
            ranks.append((manager.name, sum_act, sum_proj, sum_diffs))
        
        sorted_ranks = sorted(ranks, key=lambda x: x[3])
        for idx, srank in enumerate(sorted_ranks, start=1):
            print(f"{idx}. {srank[0]} - {srank[3]}")

from django.core.management.base import BaseCommand
from django.utils import timezone

from draft import models as d
from draft.services.draft.draft import get_new_projected_team

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--weeks', action='store', type=int, dest='weeks', default=6)

    def handle(self, *args, **options):
        this_year = timezone.now().year
        drafts = d.Draft.objects.filter(year=this_year)
        for draft in drafts:
            drafter = d.Manager.objects.filter(draft=draft, name=draft.drafter).first()
            new_projected_team = get_new_projected_team(owner=drafter)
            for k,v in new_projected_team.items():
                if v:
                    data = [draft.draft_name, k, str(v['player']), str(v['price']), str(v['position'])]
                    print("|".join(data))
                else:
                    print('missing')
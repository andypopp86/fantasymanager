from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os 
import csv

from django.utils import timezone
from django.db.models import Q, Sum

from draft import models as d
from draft.views import get_new_projected_team

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--draft', action='store', type=int, dest='draft_id')
        parser.add_argument('--sort_pos', action='store', dest='sort_pos', default="RB")

    def handle(self, *args, **options):
        draft = d.Draft.objects.filter(id=options['draft_id']).first()
        sort_pos = options["sort_pos"]
        if not draft:
            print('NO SUCH DRAFT')
        budget = 200.0
        picks = draft.drafted_players.filter(drafted=True)
        picks = picks.values('manager__name', 'player__position')
        picks = picks.annotate(pos_alloc=Sum('price'))
        picks = picks.order_by('manager__name', 'player__position')

        mdict = {}
        for pick in picks:
            if pick["manager__name"] not in mdict:
                mdict[pick["manager__name"]] = {"QB": 0, "RB": 0, "WR": 0, "TE": 0, "DEF": 0}
            mdict[pick["manager__name"]][pick["player__position"]] = round((float(pick["pos_alloc"]) / budget) * 100, 0)

        sorted_mdict = dict(sorted(mdict.items(), key=lambda x: x[1][sort_pos], reverse=True))
        for k,v in sorted_mdict.items():
            print(k,v)
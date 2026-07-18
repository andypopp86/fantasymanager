import logging
logger = logging.getLogger(__name__)

from django.core.management.base import BaseCommand, CommandError

import os 

from rules import models as r
from users import models as u

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first')

    def handle(self, *args, **options):

        if options['delete_all_first']:
            existing = r.RuleDecision.objects.all()
            for obj in existing:
                obj.delete()
        
        data_path = os.path.join(os.getcwd(),'data','votes.txt')
        with open(data_path, 'r') as f:
            lines = f.readlines()
            for line in lines:
                row = line.strip()
                rule, voter, decision = row.split('\t')
                logger.info(rule, voter, decision)
                user = u.FUser.objects.get(username=voter)
                rule_obj = r.Rule.objects.get(name=rule)

                vote = r.RuleDecision.objects.create(
                    voter=user,
                    rule_to_decide=rule_obj,
                    decision=decision.lower()
                )
                vote.save()

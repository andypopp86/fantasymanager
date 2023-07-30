from django.core.management.base import BaseCommand, CommandError

import os 

from rules import models as r

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first')

    def handle(self, *args, **options):

        if options['delete_all_first']:
            existing_rules = r.Rule.objects.all()
            for rule in existing_rules:
                print('deleting rule', rule)
                rule.delete()
        
        data_path = os.path.join(os.getcwd(),'data','rules.txt')
        with open(data_path, 'r') as f:
            lines = f.readlines()
            for line in lines:
                rule_text = line.strip()
                name, short = rule_text.split(',')
                rule = r.Rule.objects.create(name=name, short_name=short)
                rule.save()

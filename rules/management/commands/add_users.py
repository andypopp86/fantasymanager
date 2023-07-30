from django.core.management.base import BaseCommand, CommandError

import os 

from rules import models as r
from users import models as u

class Command(BaseCommand):
    # help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('--delete_all_first', action='store_true', dest='delete_all_first')
        parser.add_argument('--update_password', action='store_true', dest='update_password')

    def handle(self, *args, **options):
        data_path = os.path.join(os.getcwd(),'data','users.txt')
        if options['update_password']:
            with open(data_path, 'r') as f:
                lines = f.readlines()
                for line in lines:
                    row = line.strip()
                    email, username, password = row.split(',')
                    user = u.FUser.objects.get(email=email)
                    user.set_password(password)
                    user.save()
        else:

            if options['delete_all_first']:
                existing = u.FUser.objects.all()
                for obj in existing:
                    obj.delete()
            
            with open(data_path, 'r') as f:
                lines = f.readlines()
                for line in lines:
                    row = line.strip()
                    email, username, password = row.split(',')
                    print(email, username)

                    user = u.FUser.objects.create(email=email, username=username, password=password)
                    user.save()

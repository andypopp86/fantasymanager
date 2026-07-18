import logging
import csv
logger = logging.getLogger(__name__)

from email.policy import default
from django.core.management.base import BaseCommand, CommandError

import os
import json
import requests

from django.utils import timezone
from django.db import models

from draft import models as d

price_list = [
    70, 68, 65, 65, 63, 60, 60, 58, 55, 52, 50, 48, 48, 42, 40, 40, 39, 39, 38, 37, 34, 31, 31, 30, 30, 30, 29, 28, 26, 25, 23,
    23, 22, 22, 22, 21, 20, 19, 18, 18, 17, 16, 15, 15, 15, 14, 14, 14, 13, 13, 13, 13, 12, 12, 11, 11, 10, 10, 10, 10, 10, 10, 10, 9, 9, 9,
    8, 8, 8, 7, 7, 7, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1
] # stopped at ricky pearsall 10.07




def print_running_totals(price_list):
    total_budget = 2000
    running_total = 0
    for price in price_list:
        running_total += price
        if running_total > total_budget:
            print(f'price: {price} - running total: {running_total} - OVER BUDGET')
            break
        print(f'price: {price} - running total: {running_total}')

def update_projected_prices(price_list):
    this_year = timezone.now().year
    players = d.Player.objects.exclude(position='PK').filter(year=this_year).order_by('adp_formatted')
    for i, player in enumerate(players):
        player.projected_price = price_list[i] if i < len(price_list) else 1
        player.save(update_fields=['projected_price'])


class Command(BaseCommand):

    def add_arguments(self, parser):
        parser.add_argument('--update', action='store_true', dest='update', default=False, help='Run the command and update the database.')

    def handle(self, *args, **options):
        update = options['update']
        print_running_totals(price_list)
        if update:
            update_projected_prices(price_list)
            print('Projected prices updated successfully.')
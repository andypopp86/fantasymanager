# Generated by Django 4.0.4 on 2023-08-19 14:48

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('draft', '0050_nflteam_early_season_def_nflteam_early_season_qb_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='draft',
            name='starting_budget',
            field=models.IntegerField(default=200),
        ),
    ]

# Generated by Django 4.0.4 on 2023-08-13 21:41

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('draft', '0046_alter_matchup_options_nflteam_defensive_ranking'),
    ]

    operations = [
        migrations.AddField(
            model_name='nflteam',
            name='pass_ranking',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='nflteam',
            name='run_ranking',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='player',
            name='favorite',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='player',
            name='offensive_support',
            field=models.IntegerField(default=0),
        ),
    ]
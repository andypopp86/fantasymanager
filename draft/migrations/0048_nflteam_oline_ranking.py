# Generated by Django 4.0.4 on 2023-08-14 00:17

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('draft', '0047_nflteam_pass_ranking_nflteam_run_ranking_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='nflteam',
            name='oline_ranking',
            field=models.IntegerField(default=0),
        ),
    ]

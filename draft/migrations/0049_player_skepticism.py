# Generated by Django 4.0.4 on 2023-08-15 22:02

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('draft', '0048_nflteam_oline_ranking'),
    ]

    operations = [
        migrations.AddField(
            model_name='player',
            name='skepticism',
            field=models.IntegerField(default=0),
        ),
    ]
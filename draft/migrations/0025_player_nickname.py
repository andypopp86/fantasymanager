# Generated by Django 4.0.4 on 2022-08-25 02:22

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('draft', '0024_historicaldraftpicks_historical_stat'),
    ]

    operations = [
        migrations.AddField(
            model_name='player',
            name='nickname',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
    ]

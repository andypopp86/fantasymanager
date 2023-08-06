# Generated by Django 4.0.4 on 2023-08-06 16:35

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('draft', '0042_player_early_season_schedule_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='NFLTeam',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=10)),
                ('year', models.IntegerField(blank=True, null=True)),
                ('playoff_weather_score', models.IntegerField(blank=True, default=None, null=True)),
                ('early_season_schedule', models.IntegerField(blank=True, default=None, null=True)),
            ],
        ),
        migrations.RemoveField(
            model_name='player',
            name='early_season_schedule',
        ),
        migrations.RemoveField(
            model_name='player',
            name='playoff_weather_score',
        ),
        migrations.AddField(
            model_name='player',
            name='team',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='draft.nflteam'),
        ),
    ]

# Generated by Django 4.0.4 on 2023-08-21 00:45

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('draft', '0053_draft_notes_alter_budgetplayer_player_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='YearlyNotes',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year', models.IntegerField()),
                ('notes', models.TextField(blank=True, null=True)),
            ],
        ),
        migrations.RemoveField(
            model_name='draft',
            name='notes',
        ),
    ]

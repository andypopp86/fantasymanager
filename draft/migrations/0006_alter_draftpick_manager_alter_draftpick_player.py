# Generated by Django 4.0.4 on 2022-07-17 14:36

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('draft', '0005_manager_budget_alter_manager_draft'),
    ]

    operations = [
        migrations.AlterField(
            model_name='draftpick',
            name='manager',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='draft_managers', to='draft.manager'),
        ),
        migrations.AlterField(
            model_name='draftpick',
            name='player',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='drafted_players', to='draft.player'),
        ),
    ]

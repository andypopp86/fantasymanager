# Generated by Django 4.0.4 on 2023-07-19 01:11

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('draft', '0034_alter_player_player_id_alter_player_unique_together'),
    ]

    operations = [
        migrations.AddField(
            model_name='draft',
            name='locked',
            field=models.BooleanField(default=False),
        ),
    ]

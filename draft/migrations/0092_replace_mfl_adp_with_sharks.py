"""Drop MyFantasyLeague's ADP column, add FantasySharks'.

Deliberately NOT a rename: the two columns hold different data. MFL's ADP came
from a drafter base that is ~43% superflex with no 1QB filter in any feed, which
put 8 QBs in its top 50 against FFC's 1. Carrying those values into the new
column would preserve exactly the distortion the swap exists to remove.

Separate from the 0091 data cleanup because Postgres refuses to ALTER a column
type in the transaction that just wrote to the table (see 0089/0090).
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("draft", "0091_retire_mfl_adp_source"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="player",
            name="adp_mfl",
        ),
        migrations.AddField(
            model_name="player",
            name="adp_sharks",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]

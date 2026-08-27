"""Cast the now-ranked ADP columns to integers. See 0089 for the why.

Separate from 0089 because Postgres will not ALTER a column type in the same
transaction that wrote to the table.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("draft", "0089_adp_values_to_ranks"),
    ]

    operations = [
        migrations.AlterField(
            model_name="player",
            name="adp_ffc",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="player",
            name="adp_formatted",
            field=models.PositiveIntegerField(),
        ),
        migrations.AlterField(
            model_name="player",
            name="adp_fpros",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="player",
            name="adp_mfl",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]

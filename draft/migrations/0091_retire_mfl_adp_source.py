"""Retire the `mfl` ADP source before its column is dropped in 0092.

Anything still pointing at `mfl` has to be cleaned up or it becomes a dangling
reference to a source that no longer exists:

  * Players whose adp_formatted came from mfl get `adp_source = ''`, the
    existing marker for "this row's ADP is left over from a previous source".
    Their adp_formatted and price are deliberately NOT touched - same rule as a
    coverage gap. Re-apply a live source to refresh them.
  * The AdpSourceSync row (freshness metadata and the is_active toggle).
  * Any hand-made aliases scoped to mfl. Aliases with a blank source apply to
    every source and are left alone.

Separate migration from the schema change: Postgres will not ALTER a column in
the transaction that just wrote to that table.
"""

from django.db import migrations


def retire_mfl(apps, schema_editor):
    Player = apps.get_model('draft', 'Player')
    AdpSourceSync = apps.get_model('draft', 'AdpSourceSync')
    AdpPlayerAlias = apps.get_model('draft', 'AdpPlayerAlias')

    Player.objects.filter(adp_source='mfl').update(adp_source='')
    AdpSourceSync.objects.filter(source='mfl').delete()
    AdpPlayerAlias.objects.filter(source='mfl').delete()


def noop_reverse(apps, schema_editor):
    """Nothing to restore: the mfl column is gone in 0092, so re-pointing rows
    at a dead source would be worse than leaving them marked as left over."""


class Migration(migrations.Migration):

    dependencies = [
        ("draft", "0090_adp_columns_are_integers"),
    ]

    operations = [
        migrations.RunPython(retire_mfl, noop_reverse),
    ]

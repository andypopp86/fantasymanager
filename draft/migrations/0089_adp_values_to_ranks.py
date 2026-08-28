"""Re-rank every ADP column in place, BEFORE the type change in 0090.

The columns held three different units — FFC and MFL an average overall pick
over different draft pools (MFL's look like 7.74), FantasyPros a consensus rank,
and adp_formatted FFC's round.pick rendering ("3.05") — so the numbers on one
row could not be compared by eye, which is the only reason to show them side by
side. Each column becomes a dense 1..N index over the players it ranks.

This pass MUST land before the numeric -> integer cast in 0090. A plain cast
truncates, and round.pick truncates catastrophically: 1.01 through 1.10 are ten
different players who would all collapse to 1. Ranking first makes the cast a
no-op.

It is a separate migration from the cast, rather than a RunPython in front of
it, because Postgres refuses to ALTER a column's type in the same transaction
that just wrote rows to the table ("pending trigger events").

Ranking is per (year, column), ordered by the existing value with the player
name as a deterministic tiebreaker. NULLs are skipped and stay NULL.
"""

from django.db import migrations

RANKED_COLUMNS = ('adp_formatted', 'adp_ffc', 'adp_mfl', 'adp_fpros')


def to_ranks(apps, schema_editor):
    Player = apps.get_model('draft', 'Player')
    for year in Player.objects.values_list('year', flat=True).distinct():
        for column in RANKED_COLUMNS:
            rows = list(
                Player.objects
                .filter(year=year)
                .exclude(**{f'{column}__isnull': True})
                .order_by(column, 'name')
                .values_list('pk', flat=True)
            )
            for index, pk in enumerate(rows, start=1):
                Player.objects.filter(pk=pk).update(**{column: index})


def noop_reverse(apps, schema_editor):
    """Irreversible in substance: the original average picks and round.pick
    values are gone once ranked. Reversing the schema is fine, but the old
    values do not come back - re-run sync_adp and apply_adp_source.
    """


class Migration(migrations.Migration):

    dependencies = [
        ("draft", "0088_adpplayeralias"),
    ]

    operations = [
        migrations.RunPython(to_ranks, noop_reverse),
    ]

# Existing favorite=False rows predate the tri-state and just mean "never
# favorited" — map them to the new neutral state (null). False now means
# an explicit "avoid" set by cycling the heart.
from django.db import migrations


def false_to_null(apps, schema_editor):
    Player = apps.get_model("draft", "Player")
    Player.objects.filter(favorite=False).update(favorite=None)


def null_to_false(apps, schema_editor):
    Player = apps.get_model("draft", "Player")
    Player.objects.filter(favorite__isnull=True).update(favorite=False)


class Migration(migrations.Migration):

    dependencies = [
        ("draft", "0079_alter_player_favorite"),
    ]

    operations = [
        migrations.RunPython(false_to_null, null_to_false),
    ]

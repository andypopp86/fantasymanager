# Generated by Django 4.0.4 on 2022-08-02 00:09

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('draft', '0011_historicaldraftpicks'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='historicaldraftpicks',
            options={'ordering': ('year', 'manager', '-price')},
        ),
        migrations.AddField(
            model_name='draft',
            name='drafter',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]

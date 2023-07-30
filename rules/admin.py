from django.contrib import admin

from .models import Rule, RuleDecision

admin.site.register(Rule)
admin.site.register(RuleDecision)


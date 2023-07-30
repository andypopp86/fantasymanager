from django.db import models
from django.utils.translation import gettext_lazy as _
from rules.base_models import BaseObject

from users import models as u

RULE_RESULTS = (
    ('pass', 'PASS'),
    ('not', 'NO PASS')
)
DECISIONS = (
    ('yes', 'YES'),
    ('no', 'NO')
)
# Create your models here.
class Rule(BaseObject):
    name = models.CharField(_('Rule Name'), max_length=200 )
    short_name = models.CharField(_('Rule Short Name'), max_length=50 )
    result = models.CharField(_('Result'), max_length=50, choices=RULE_RESULTS )

    def __str__(self) -> str:
        return self.name

class RuleDecision(BaseObject):
    voter = models.ForeignKey(u.FUser, verbose_name=_('Voter'), on_delete=models.PROTECT, related_name='voters')
    rule_to_decide = models.ForeignKey(Rule, verbose_name=_('Rule'), on_delete=models.PROTECT, related_name='decisions')
    decision = models.CharField(_('Decision'), max_length=50, choices=DECISIONS )

    def __str__(self) -> str:
        return '%s: %s voted %s' % (self.rule_to_decide, self.voter.username, self.decision.upper())
    
from django import forms

from .models import Rule
from .models import RuleDecision

class RuleModelForm(forms.ModelForm):
	class Meta:
		model = Rule
		fields = (
			'name',
		)

class RuleDecisionModelForm(forms.ModelForm):
	class Meta:
		model = RuleDecision
		fields = (
			'voter',
			'rule_to_decide',
			'decision',
		)
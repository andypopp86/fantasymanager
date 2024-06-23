from django.views import generic
from django.urls import reverse

from .models import Rule, RuleDecision
from .forms import RuleModelForm, RuleDecisionModelForm

from users import models as u


class RuleListView(generic.ListView):
    template_name = 'rule/list.html'
    context_object_name = 'rules'

    def get_queryset(self):
        return Rule.objects.all()

class RuleDetailView(generic.DetailView):
    template_name = 'rule/detail.html'
    context_object_name = 'rule'

    def get_queryset(self):
        pk = self.kwargs.get('pk')
        queryset = Rule.objects.filter(pk=pk)
        return queryset

class RuleCreateView(generic.CreateView):
    template_name = 'rule/create.html'
    form_class = RuleModelForm

    def get_success_url(self):
        return reverse('rule:list')

class RuleUpdateView(generic.UpdateView):
    template_name = 'rule/update.html'
    context_object_name = 'rule'

    form_class = RuleModelForm

    def get_success_url(self):
        return reverse('rule:list')

    def get_queryset(self):
        pk = self.kwargs.get('pk')
        queryset = Rule.objects.filter(pk=pk)
        return queryset

class RuleDeleteView(generic.DeleteView):
    template_name = 'rule/delete.html'
    context_object_name = 'rule'

    def get_success_url(self):
        return reverse('rule:list')

    def get_queryset(self):
        pk = self.kwargs.get('pk')
        queryset = Rule.objects.filter(pk=pk)
        return queryset


class RuleDecisionListView(generic.ListView):
    template_name = 'rule_decision/list.html'
    context_object_name = 'rule_decisions'

    def get_context_data(self, **kwargs):
        context = super(RuleDecisionListView, self).get_context_data(**kwargs)
        rule_decisions = self.object_list

        users = u.FUser.objects.filter(is_superuser=False)

        vdicts = {}
        for user in users:
            vdicts[user.username] = {}
        for vote in rule_decisions:
            vdicts[vote.voter.username][vote.rule_to_decide.short_name] = {
                'vote': vote,
                'decision': vote.decision,
                'vote_name': vote.rule_to_decide.name,
                'vote_short_name': vote.rule_to_decide.short_name
            }

        headers = []
        for user, rule_decision in vdicts.items():
            if rule_decision:
                for topic, vote in rule_decision.items():
                    if topic not in headers:
                        headers.append(topic)

        context.update({
            "vdicts": vdicts,
            "rule_headers": headers
        })
        return context


    def get_queryset(self):
        return RuleDecision.objects.all()

class RuleDecisionDetailView(generic.DetailView):
    template_name = 'rule_decision/detail.html'
    context_object_name = 'rule_decision'

    def get_queryset(self):
        pk = self.kwargs.get('pk')
        queryset = RuleDecision.objects.filter(pk=pk)
        return queryset

class RuleDecisionCreateView(generic.CreateView):
    template_name = 'rule_decision/create.html'
    form_class = RuleDecisionModelForm

    def get_success_url(self):
        return reverse('rules:rule-decision-create')

class RuleDecisionUpdateView(generic.UpdateView):
    template_name = 'rule_decision/update.html'
    context_object_name = 'rule_decision'

    form_class = RuleDecisionModelForm

    def get_success_url(self):
        return reverse('rules:rule-decision-update')

    def get_queryset(self):
        pk = self.kwargs.get('pk')
        queryset = RuleDecision.objects.filter(pk=pk)
        return queryset

class RuleDecisionDeleteView(generic.DeleteView):
    template_name = 'rule_decision/delete.html'
    context_object_name = 'rule_decision'

    def get_success_url(self):
        return reverse('rules:rule-decision-list')

    def get_queryset(self):
        pk = self.kwargs.get('pk')
        queryset = RuleDecision.objects.filter(pk=pk)
        return queryset


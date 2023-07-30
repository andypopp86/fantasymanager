from django.urls import path
from rules import views as r

app_name = 'Rule'

urlpatterns = [
	path(r'list/', r.RuleListView.as_view(), name='list'),
	path(r'create/', r.RuleCreateView.as_view(), name='create'),
	path(r'detail/<int:pk>/', r.RuleDetailView.as_view(), name='detail'),
	path(r'delete/<int:pk>/', r.RuleDeleteView.as_view(), name='delete'),
	path(r'update/<int:pk>/', r.RuleUpdateView.as_view(), name='update'),
	path(r'rule-decision-list/', r.RuleDecisionListView.as_view(), name='rule-decision-list'),
	path(r'rule-decision-create/', r.RuleDecisionCreateView.as_view(), name='rule-decision-create'),
	path(r'rule-decision-detail/<int:pk>/', r.RuleDecisionDetailView.as_view(), name='rule-decision-detail'),
	path(r'rule-decision-delete/<int:pk>/', r.RuleDecisionDeleteView.as_view(), name='rule-decision-delete'),
	path(r'rule-decision-update/<int:pk>/', r.RuleDecisionUpdateView.as_view(), name='rule-decision-update'),
]

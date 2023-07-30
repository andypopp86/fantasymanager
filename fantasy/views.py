from django.urls import reverse
from django.http import HttpResponseRedirect


def home(request):
    return HttpResponseRedirect(reverse('rules:list'))
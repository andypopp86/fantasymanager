from django.shortcuts import render
from django.urls import reverse
from django.views import generic 
from .models import FUser
from .forms import CustomUserCreationForm

class SignupView(generic.CreateView):
    template_name = "registration/signup.html"
    form_class = CustomUserCreationForm

    def form_valid(self, form):
        user = form.save(commit=False)
        user.save()
        competitor = FUser.objects.create(
            user=user,
            name=form.cleaned_data['username']
        )
        competitor.save()
        return super(SignupView, self).form_valid(form)

    def get_success_url(self):
        return reverse("login")
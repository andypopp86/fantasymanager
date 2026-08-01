from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UserChangeForm, UserCreationForm, UsernameField

User = get_user_model()

class CustomUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("first_name"
            ,"last_name"
            ,"email"
            ,)
        field_classes = {'email': UsernameField}


# auth's UserChangeForm targets auth.User; rebind it to FUser for the admin.
class CustomUserChangeForm(UserChangeForm):
    # Drop the ReadOnlyPasswordHashField that renders the algorithm/salt/hash
    # breakdown; FUserAdmin shows a set-password link instead.
    password = None

    class Meta:
        model = User
        fields = "__all__"
        field_classes = {'email': UsernameField}
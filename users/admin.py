from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.urls import reverse
from django.utils.html import format_html

from users.forms import CustomUserChangeForm, CustomUserCreationForm
from users.models import FUser


# Must extend auth's UserAdmin, not ModelAdmin: a plain ModelAdmin renders the
# password column as an editable text field and saves whatever is typed
# UNHASHED, silently breaking login for that account. UserAdmin hashes on
# create and shows a change-password form instead of the raw field.
class FUserAdmin(DjangoUserAdmin):
    model = FUser
    add_form = CustomUserCreationForm
    form = CustomUserChangeForm

    ordering = ("email",)
    search_fields = ("email", "username", "first_name", "last_name")
    list_display = ("email", "first_name", "last_name", "is_staff")
    # is_staff is the app's role flag: staff = drafter, non-staff = spectator
    readonly_fields = ("set_password",)
    fieldsets = (
        (None, {"fields": ("email", "set_password")}),
        ("Personal info", {"fields": ("username", "first_name", "last_name")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "first_name", "last_name", "password1", "password2", "is_staff"),
        }),
    )

    @admin.display(description="Password")
    def set_password(self, obj):
        if not obj.pk:
            return ""
        # UserAdmin registers the change-password view under this fixed name
        # regardless of the user model.
        url = reverse("admin:auth_user_password_change", args=[obj.pk])
        return format_html('<a href="{}">Set a new password</a>', url)


admin.site.register(FUser, FUserAdmin)

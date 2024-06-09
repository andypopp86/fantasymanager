from django.conf.urls import include
from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth.views import (
    LoginView, 
    LogoutView, 
    PasswordResetView, 
    PasswordResetDoneView,
    PasswordResetConfirmView,
    PasswordResetCompleteView
)
from fantasy import views as fview
from users import views as uview


urlpatterns = [
    path('admin/', admin.site.urls),
    path('', fview.home, name='home'),
    path('signup/', uview.SignupView.as_view(), name='signup'),
    path('reset-password/', PasswordResetView.as_view(), {"page_title": "Reset"}, name='reset-password'),
    path('password-reset-done/', PasswordResetDoneView.as_view(), {"page_title": "Reset Done"}, name='password_reset_done'),
    path('password-reset-confirm/<uidb64>/<token>/', PasswordResetConfirmView.as_view(), {"page_title": "Confirm"}, name='password_reset_confirm'),
    path('password-reset-complete/', PasswordResetCompleteView.as_view(), {"page_title": "Complete"}, name='password_reset_complete'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), {"page_title": "Log Out"}, name='logout'),
    path('__debug__/', include('debug_toolbar.urls', namespace='djdt')),
    path('rules/', include('rules.urls', namespace='rules')),
    path('draft/', include('draft.urls', namespace='draft')),
    # path('users/', include('users.urls', namespace='users')),
]

api_urlpatterns = [
    path("drafts/", include(("draft.api.urls", "drafts"), namespace="drafts")),
]

urlpatterns += [
    path("api/", include((api_urlpatterns, "api"), namespace="api"))
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

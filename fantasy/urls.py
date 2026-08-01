from django.conf.urls import include
from django.contrib import admin
from django.urls import path, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth.views import (
    LoginView,
    LogoutView,
)
from fantasy import views as fview
from users import api as uapi
from draft import views as draft_views


urlpatterns = [
    path('admin/', admin.site.urls),
    path('', fview.home, name='home'),
    # No self-service signup or password reset: accounts are created and
    # passwords set by the admin in /admin (see AGENTS.md "Auth & roles").
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), {"page_title": "Log Out"}, name='logout'),
    path('__debug__/', include('debug_toolbar.urls', namespace='djdt')),
    path('rules/', include('rules.urls', namespace='rules')),
    path('draft/', include('draft.urls', namespace='draft')),
    # path('users/', include('users.urls', namespace='users')),
    # The React SPA owns every path under /app/ (client-side routing), so any
    # /app/... URL must serve the same entrypoint for deep links to work.
    re_path(r'^app/', draft_views.react_draft_entrypoint, name='react_app'),
]

api_urlpatterns = [
    path("drafts/", include(("draft.api.urls", "drafts"), namespace="drafts")),
    path("me/", uapi.MeAPI.as_view(), name="me"),
]

urlpatterns += [
    path("api/", include((api_urlpatterns, "api"), namespace="api"))
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

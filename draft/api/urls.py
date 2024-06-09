from django.urls import include, path
from . import views as api_views

draft_urlpatterns = [
    path("detail/<int:draft_id>", api_views.DraftDetailAPI.as_view(), name="draft")
]

urlpatterns = [
    path("draft/", include((draft_urlpatterns, "draft"), namespace="draft")),
]
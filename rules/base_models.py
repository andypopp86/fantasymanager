from django.db import models
from django.utils.translation import gettext_lazy as _

class BaseObject(models.Model):
    date_created = models.DateTimeField(_('Date Created'), auto_now_add=True)
    date_modified = models.DateTimeField(_('Date Created'), auto_now=True)
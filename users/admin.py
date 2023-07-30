from django.contrib import admin

from users import models as u 

class UserAdmin(admin.ModelAdmin):
    pass 

admin.site.register(u.FUser, UserAdmin)

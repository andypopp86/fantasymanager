"""Single settings file for all environments, driven by environment
variables (see AGENTS.md "Hosted deploy"). Local dev reads them from .env;
Railway injects them as service variables. The env-controlled knobs:

    DEBUG                 bool, default False (local .env sets True)
    SECRET_KEY            required
    DATABASE_URL          hosted DB (takes precedence over the DB_* vars)
    DB_NAME/USER/PASSWORD/HOST/PORT   local Postgres (used when no DATABASE_URL)
    ALLOWED_HOSTS         extra hostnames, comma-separated (hosted domain)
    CSRF_TRUSTED_ORIGINS  scheme+host origins, comma-separated (hosted domain)
    VITE_DEV_MODE         bool, default DEBUG — false serves the built bundle
    VITE_DEV_HOST         host written into dev script tags (LAN serving)
"""

import os
import sys

import environ

# ---------------------------------------------------------------------------
# Paths & environment
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

env = environ.Env(
    DEBUG=(bool, False)
)
env_file = os.path.join(BASE_DIR, '.env')
if os.path.exists(env_file):
    environ.Env.read_env(env_file)

DEBUG = env('DEBUG')
SECRET_KEY = env('SECRET_KEY')

# The debug toolbar can't run under `manage.py test` (it refuses when Django
# forces DEBUG=False), so leave it out of the app/middleware lists entirely.
TESTING = 'test' in sys.argv

# ---------------------------------------------------------------------------
# Hosts & CSRF
# ---------------------------------------------------------------------------

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]']
if DEBUG:
    # Dev only: lets other devices on the LAN reach the app (e.g. the
    # spectator board on a second laptop during the live draft).
    ALLOWED_HOSTS.append('*')
# Hosted deploys (Railway) add their public hostname via env, e.g.
# ALLOWED_HOSTS=myapp.up.railway.app  CSRF_TRUSTED_ORIGINS=https://myapp.up.railway.app
ALLOWED_HOSTS += env.list('ALLOWED_HOSTS', default=[])
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=[])

INTERNAL_IPS = ['localhost', '127.0.0.1']  # debug toolbar

# ---------------------------------------------------------------------------
# Request limits
# ---------------------------------------------------------------------------

# /admin's player list is edited INLINE, a page at a time: 11 list_editable
# fields x 100 rows (list_per_page), and every row also posts its pk and an
# action checkbox — about 1,300 fields, over Django's 1,000 default, so saving
# the list view failed outright with TooManyFieldsSent. Raised rather than
# worked around by paginating smaller or dropping editable columns, because
# bulk inline editing IS the prep workflow (tiers, risk, favorites).
#
# The cap exists to bound the cost of parsing a hostile form post. Every
# request that can reach this many fields is behind @login_required and the
# staff-only admin, and the new ceiling still bounds a runaway request, so the
# guard is loosened, not removed. Headroom is deliberate: adding an editable
# column or bumping list_per_page must not resurrect a confusing 400.
DATA_UPLOAD_MAX_NUMBER_FIELDS = 5000

# ---------------------------------------------------------------------------
# Apps & middleware
# ---------------------------------------------------------------------------

INSTALLED_APPS = ([] if TESTING else ['debug_toolbar']) + [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',

    'drf_spectacular',
    'bootstrap3',
    'mathfilters',
    'django_vite',

    'users',
    'rules',
    'draft'
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # WhiteNoise serves collected static files in production (gunicorn has no
    # static handling); harmless no-op under runserver in dev.
    'whitenoise.middleware.WhiteNoiseMiddleware',
] + ([] if TESTING else ['debug_toolbar.middleware.DebugToolbarMiddleware']) + [
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# ---------------------------------------------------------------------------
# URLs, templates, WSGI
# ---------------------------------------------------------------------------

ROOT_URLCONF = 'fantasy.urls'
WSGI_APPLICATION = 'fantasy.wsgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, "templates")],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

# Hosted platforms (Railway) inject a single DATABASE_URL; local dev keeps
# the discrete DB_* vars from .env.
if env.str('DATABASE_URL', default=''):
    DATABASES = {'default': env.db('DATABASE_URL')}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql_psycopg2',
            'NAME': env('DB_NAME'),
            'USER': env('DB_USER'),
            'PASSWORD': env('DB_PASSWORD'),
            'HOST': env('DB_HOST'),
            'PORT': env('DB_PORT'),
        }
    }

DEFAULT_AUTO_FIELD = 'django.db.models.AutoField'

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

AUTH_USER_MODEL = "users.FUser"

LOGIN_URL = "/login/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/login/"

# Deliberately minimal: accounts are admin-created for a handful of friends
# (see AGENTS.md "Auth & roles"), so any non-empty password is accepted.
AUTH_PASSWORD_VALIDATORS = []

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static files (collected by collectstatic, served by WhiteNoise in prod)
# ---------------------------------------------------------------------------

STATIC_URL = 'static/'
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, "static"),
    os.path.join(BASE_DIR, "frontend/draftboard/dist"),
]
STATIC_ROOT = os.path.join(BASE_DIR, "static_root")

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Compressed but NOT manifest storage: the Vite bundle is already
    # content-hashed, and manifest hashing would break django-vite's URLs.
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# ---------------------------------------------------------------------------
# DRF
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.LimitOffsetPagination',
    'PAGE_SIZE': 10,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    # Baseline: no anonymous API access. Drafter-only endpoints additionally
    # require is_staff via draft.api.permissions.IsDrafter.
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
}

# ---------------------------------------------------------------------------
# django-vite (React bundle serving — see AGENTS.md)
# ---------------------------------------------------------------------------

# VITE_DEV_MODE=false serves the built bundle (npm run build) instead of the
# Vite dev server, independent of DEBUG. Required when remote viewers can't
# reach port 3001 (e.g. serving through a tunnel — see TUNNEL_RUNBOOK.md).
VITE_DEV_MODE = env.bool('VITE_DEV_MODE', default=DEBUG)

DJANGO_VITE = {
    "default": {"dev_mode": VITE_DEV_MODE},
    # dev_server_host: in dev mode django-vite writes this host into the
    # script tags. It must be an address OTHER devices can reach when serving
    # the app over the LAN — set VITE_DEV_HOST to this machine's LAN IP
    # (Vite itself already binds 0.0.0.0).
    "draftboard": {
        "static_url_prefix": "js/draftboard/",
        "dev_server_port": 3001,
        "dev_mode": VITE_DEV_MODE,
        "dev_server_host": env.str("VITE_DEV_HOST", default="localhost"),
        "manifest_path": os.path.join(
            BASE_DIR, "frontend/draftboard/dist/js/draftboard/.vite/manifest.json"
        ),
    }
}

# ---------------------------------------------------------------------------
# Production security (hosted deploys run DEBUG=false)
# ---------------------------------------------------------------------------

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    X_FRAME_OPTIONS = "DENY"

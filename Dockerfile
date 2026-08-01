# Production image for hosted deploys (Railway). Local dev never uses this —
# see AGENTS.md for the dev workflow. Two stages: build the React bundle,
# then a Python image that serves everything via gunicorn + WhiteNoise.

FROM node:22-slim AS frontend
WORKDIR /build
COPY frontend/draftboard/package.json frontend/draftboard/package-lock.json ./
RUN npm ci
COPY frontend/draftboard/ ./
RUN npm run build

FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend /build/dist ./frontend/draftboard/dist

# Prod bundle serving; real values for these come from Railway service
# variables at runtime — the dummies below only let collectstatic import
# settings at build time (it touches no database).
ENV VITE_DEV_MODE=false DEBUG=false
RUN SECRET_KEY=build-only-dummy DATABASE_URL=postgres://build:build@build/build \
    python manage.py collectstatic --noinput

EXPOSE 8000
# Railway injects PORT. Migrations run at boot: single-instance app, so no
# concurrent-migration concerns, and the DB is only reachable at runtime.
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn fantasy.wsgi --bind 0.0.0.0:${PORT:-8000} --workers 2"]

# Railway Runbook — hosted instance (low-cost, disable-able)

How to run the app on [Railway](https://railway.com) for a season and shut it
down after. The repo side is done (Dockerfile, env-driven settings); this file
is the Railway-side clicks. The hosted instance is a **copy** — the Windows
laptop's database stays the system of record, and draft day still runs on the
LAN (`AGENTS.md`) with the tunnel (`TUNNEL_RUNBOOK.md`) as the remote-viewer
option.

## One-time setup

1. **Account & project**: sign in at railway.com with GitHub → New Project.

2. **Postgres**: in the project, `Create → Database → PostgreSQL`. Done — it
   exposes `DATABASE_URL` to other services in the project.

3. **App service**: `Create → GitHub Repo → andypopp86/fantasymanager`.
   Railway sees the `Dockerfile` and uses it automatically (React bundle is
   built inside the image; migrations run at boot).

4. **Domain**: in the app service → Settings → Networking → Generate Domain.
   Note the hostname (e.g. `fantasymanager-production-ab12.up.railway.app`).

5. **Variables** (app service → Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference, not a literal) |
   | `SECRET_KEY` | long random string — generate one, don't reuse dev |
   | `DEBUG` | `false` |
   | `ALLOWED_HOSTS` | the generated hostname (no scheme) |
   | `CSRF_TRUSTED_ORIGINS` | `https://` + the generated hostname |

6. **Deploy** happens on save / on every push to `master`. Watch the deploy
   logs; when gunicorn reports listening, visit `https://<domain>/login/`.

## Load the real data (from the Windows laptop)

The fresh Railway DB is empty (migrations only) — no users, no drafts. Restore
a dump from the laptop:

```powershell
# 1. Dump local (adjust connection to your local Postgres; if it runs in
#    Docker, prefix with: docker exec fantasymanager-db ...)
pg_dump -h localhost -p 5434 -U fantasy_user -Fc --no-owner --no-acl fantasydb -f draft.dump

# 2. Restore to Railway — copy DATABASE_PUBLIC_URL from the Postgres
#    service's Variables tab (the public one; plain DATABASE_URL is
#    internal-only)
pg_restore --no-owner --no-acl --clean --if-exists -d "<DATABASE_PUBLIC_URL>" draft.dump
```

Your admin login and friend accounts ride along in the dump. Starting empty
instead? Point one local command at the hosted DB to create the admin account:

```powershell
$env:DATABASE_URL = "<DATABASE_PUBLIC_URL>"
python manage.py createsuperuser
Remove-Item Env:DATABASE_URL
```

## Pull data back down (after using the hosted instance for real picks)

```powershell
pg_dump -Fc --no-owner --no-acl -d "<DATABASE_PUBLIC_URL>" -f railway.dump
pg_restore --no-owner --no-acl --clean --if-exists -h localhost -p 5434 -U fantasy_user -d fantasydb railway.dump
```

## Disable for the off-season

Cheapest-to-fullest teardown, pick one:

- **Auto-sleep** (keep everything, ~pennies): app service → Settings →
  enable App Sleeping. Scales to zero when idle; first request after idle
  takes a few seconds.
- **Take the app offline** (keep the DB): app service → Deployments → remove
  the active deployment. Postgres keeps billing only for storage. Redeploy
  from the dashboard (or push to master) to come back.
- **Full teardown** ($0): pull the data down (above), then delete the
  project. Re-run this runbook next season — it's ~15 minutes.

## Costs

Hobby plan: $5/month, includes $5 of usage — this app plus Postgres fits
comfortably inside that while active. Sleeping/off-season: storage pennies.

## Gotchas

- `DEBUG=false` means `ALLOWED_HOSTS`/`CSRF_TRUSTED_ORIGINS` must be right or
  you'll see 400s / CSRF failures on login. Both need the exact hostname.
- The app requires login and spectators only see flagged drafts — same rules
  as everywhere (`AGENTS.md` "Auth & roles"). Flag the real draft.
- Passwords: validators are relaxed repo-wide. On the public internet, give
  the staff (drafter) account a real password.
- Every push to `master` redeploys the hosted instance while it's connected.
  Off-season, that's harmless (it's asleep or removed).

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
pg_dump -h localhost -p 5434 -U fantasy_user -Fc --no-owner --no-acl -f draft.dump fantasydb

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

## Refresh ADP / prices in-season (run the DEPLOYED command via railway ssh)

ADP moves a lot in the month before the draft, and projected prices are
derived from it. Refresh by executing the management command **inside the
deployed container** — deployed code only, internal DB networking, nothing
to leak:

```bash
railway ssh --service app -- python manage.py refresh_player_adp
```

**Rule: never point a local process at the hosted DB** (no
`DATABASE_URL=<DATABASE_PUBLIC_URL> manage.py ...`, no ad-hoc SQL). A direct
connection bypasses every app-level control and runs with full DB
privileges; the hosted DB only meets local tooling during the documented
dump/restore flows above. Corollary: the command must be in the deployed
image — **push + deploy first, then run it**. (Deploys are CLI-triggered:
`railway up --service app` from repo root; merging to master does NOT
auto-deploy — the app service isn't GitHub-connected.)

What it does: re-pulls the FFC ADP feed for the current year, creates any
missing `NFLTeam` rows, updates every listed player's team link,
`adp_formatted`, and `projected_price`, and creates players new to the feed.
`refresh_player_adp` and `add_players` run the same import
(`refresh_player_adp` is the in-season alias).

Two safety properties, learned the hard way:

- **Prices need `HistoricalDraftPicks`.** projected_price = average historical
  auction price at each ADP rank. If the target DB has no historical picks,
  the command warns and leaves existing prices untouched instead of
  flattening everything to the fallback (a DB seeded without them can use
  `add_default_prices --update` for the hardcoded curve). The Railway DB
  restored from the laptop dump has them; a from-scratch DB won't.
- **It never deletes players** (except kickers) — players who fall off the
  FFC feed keep their last ADP/price, so mid-draft refreshes are safe for
  already-created drafts. New feed players are NOT auto-added to existing
  drafts (that's `Draft.add_missing_players`).

Off-feed players also keep their old team link. On a DB whose links predate
the code+year lookup fix, chase the refresh with
`railway ssh --service app -- python manage.py relink_player_teams_for_current_year`
(idempotent) to repoint any players stuck on another season's team row.

## Push target tiers up (run the DEPLOYED command via railway ssh)

`Player.target_tier` is set by hand in /admin (inline in the player list), which
means it lives on whichever machine you did the tiering on. Move it with a CSV
that ships in the build — same rule as everything else here: **never point a
local process at the hosted DB.**

```bash
# 1. On the machine whose /admin has the tiers (dev Mac or the Windows laptop):
.venv/bin/python manage.py write_target_tiers_to_csv     # → <year>_target_tiers.csv at repo root

# 2. Commit the CSV and deploy, or the file never reaches the container.
git add 2026_target_tiers.csv && git commit -m "chore: refresh target tiers"
railway up --service app

# 3. Apply it inside the container. Check first, then commit:
railway ssh --service app -- python manage.py update_player_target_tiers --dry-run
railway ssh --service app -- python manage.py update_player_target_tiers
```

The CSV lives at the **repo root**, not `data/` — `data/` is stripped from both
the Docker and Railway builds. `.railwayignore` carries a `!*_target_tiers.csv`
exemption for the same reason the missing-players CSVs have one.

- **The file is the source of truth.** Players it doesn't list are reset to tier
  0, so clearing a tier locally clears it on the server too. Pass `--no-clear`
  to only apply the listed tiers and leave everything else alone.
- Matching is on `(player_id, year)` — Player's `unique_together`, and stable
  across the local / Windows / hosted copies, unlike the pk. player_ids in the
  file with no row for that year are reported and skipped.
- `--year` defaults to the current year. `--dry-run` reports the same counts
  inside a rolled-back transaction.
- It updates via `queryset.update()` on purpose: `Player.save()` rewrites
  `projected_price` to `max(price or 0, 1)`, so a save-based import would
  silently reprice every player with a null price.

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

## Gotchas learned from the first deploy (2026-08-01)

The first instance lives at `https://app-production-ff9c.up.railway.app`
(project `fantasymanager`, services `app` + `Postgres`). Set up entirely via
CLI; the equivalent commands:

```bash
railway init --name fantasymanager
railway add --database postgres
railway add --service app
railway variables --service app --set "SECRET_KEY=..." --set "DEBUG=false" \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --skip-deploys
railway domain --service app --port 8000
railway variables --service app --set "ALLOWED_HOSTS=<domain>" \
  --set "CSRF_TRUSTED_ORIGINS=https://<domain>" --set "PORT=8000"
railway up --service app --detach
```

- **Set `PORT=8000` explicitly.** Railway injects its own PORT (8080) that
  won't match the domain's target port → 502 despite a healthy deploy.
- **`DATABASE_PUBLIC_URL` is hostless until a TCP proxy exists.** For
  pg_dump/pg_restore from outside:
  `railway tcp-proxy create --port 5432 --service Postgres`
- **`railway up` honors `.gitignore`.** The repo's `*.txt` rule silently
  excluded `requirements.txt` from the upload until negated (`!requirements.txt`).

## Gotchas

- `DEBUG=false` means `ALLOWED_HOSTS`/`CSRF_TRUSTED_ORIGINS` must be right or
  you'll see 400s / CSRF failures on login. Both need the exact hostname.
- The app requires login and spectators only see flagged drafts — same rules
  as everywhere (`AGENTS.md` "Auth & roles"). Flag the real draft.
- Passwords: validators are relaxed repo-wide. On the public internet, give
  the staff (drafter) account a real password.
- Every push to `master` redeploys the hosted instance while it's connected.
  Off-season, that's harmless (it's asleep or removed).

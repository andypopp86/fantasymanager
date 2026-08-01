# Tunnel Runbook — share the board over the internet (Windows host)

Follow these steps on the **Windows draft-day laptop** to give people who are
NOT on the same wifi a live view of the draft. It uses a Cloudflare "quick
tunnel": your app keeps running on your laptop with its local database, and
Cloudflare gives you a temporary public URL that forwards to it. Nothing is
uploaded or deployed anywhere.

This is an **add-on** to the LAN plan in `AGENTS.md`, not a replacement — the
LAN setup keeps working even if the venue internet dies. You can run both at
the same time (LAN for people in the room, tunnel for remote folks).

---

## One-time setup (do this before draft day)

1. **Pull the latest code** (needs the `VITE_DEV_MODE` change and this file):

   ```powershell
   git pull
   ```

2. **Install cloudflared** (PowerShell):

   ```powershell
   winget install --id Cloudflare.cloudflared
   ```

   Close and reopen PowerShell afterward so `cloudflared` is on your PATH.
   Verify with `cloudflared --version`. No Cloudflare account is needed for
   quick tunnels.

3. **Build the frontend bundle**:

   ```powershell
   cd frontend\draftboard
   npm install
   npm run build
   cd ..\..
   ```

   Rebuild any time you pull new frontend code. (The tunnel serves this built
   bundle instead of the Vite dev server — remote browsers can't reach the dev
   server on port 3001, so dev mode would show them a blank page.)

## Draft day — start everything (two PowerShell windows)

**Terminal 1 — Django, serving the built bundle** (repo root):

```powershell
$env:VITE_DEV_MODE = "false"
.venv\Scripts\python manage.py runserver 0.0.0.0:8100
```

Note: no Vite terminal and no `VITE_DEV_HOST` needed in this mode — Django
serves the built JS itself, for both the tunnel and the LAN.

**Terminal 2 — the tunnel**:

```powershell
cloudflared tunnel --url http://localhost:8100
```

After a few seconds it prints a box with a URL like:

```
https://random-words-here.trycloudflare.com
```

That's your public URL. It's **different every time** you start the tunnel, so
grab it fresh on draft day.

## Share it

- **Remote spectators** get:
  `https://<random-words>.trycloudflare.com/app/board/<draft_id>`
- **You (the drafter)** keep driving the draft from the host laptop at
  `http://localhost:8100/app/`
- **Spectators in the room** can use either the tunnel URL or the LAN URL
  (`http://<LAN-IP>:8100/app/board/<draft_id>`).

## Smoke test (before draft day)

1. Start both terminals as above.
2. Open the tunnel `/app/board/<draft_id>` URL **on your phone with wifi
   turned off** (cellular only) — this proves it works from outside the house.
3. Submit a test pick from `localhost` and confirm the phone board updates
   within ~5 seconds (the spectator board polls on that interval).

## When the draft is over

`Ctrl+C` in the tunnel terminal. The URL dies with it — nobody can reach your
laptop anymore.

## Caveats / security

- **Anyone with the URL can reach the whole app**, including the endpoints
  that write picks — not just the read-only board. The random URL is the only
  gate, so share it only with your league, don't post it publicly, and kill
  the tunnel when you're done.
- Quick tunnels are free/best-effort with no uptime guarantee. Fine for
  spectators; the actual drafting never depends on it because you drive from
  `localhost`.
- The tunnel needs working internet at the venue. If it drops, the LAN plan
  is unaffected.
- If you changed frontend code and something looks stale, re-run
  `npm run build` and restart Django.

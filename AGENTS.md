# AGENTS.md

Guidance for AI agents (and humans) working in this repo.

## TL;DR — the frontend is React, and only React

The **live frontend is the React app** at `frontend/draftboard/`.
When a task mentions "the frontend", "the draft board", "the UI", or similar,
it means this React/Vite app — nothing else.

**Ignore the legacy non-React frontend.** The old jQuery/Django-template
draft board is **defunct** and its docs/code are **stale**. Do not read them
for reference, do not copy patterns from them, and do not edit them unless a
task is explicitly about deleting or migrating them. See
[`DEFUNCT_ARTIFACTS.md`](./DEFUNCT_ARTIFACTS.md) for the running list. The
known-stale artifacts are:

- `static/js/draftboard.js` — pre-React jQuery draft board (~1000 lines)
- `templates/draft/draftboard.html` + the partials it `{% include %}`s
  (`draft_modal_*.html`, `draft_manager_budgets.html`, `priceboard.html`,
  `draft_board_picks.html`, …)
- `static/css/draftboard.css` — styles for the jQuery board only

> Caveat: some other `templates/draft/*.html` (e.g. `player_running_totals.html`,
> `historical_picks.html`) **are** still rendered by live Django views. Confirm
> per-file before assuming any template is dead — only the artifacts above are
> confirmed stale.

## Where the React app lives

```
frontend/draftboard/
├── index.html            # Vite entry (dev only; prod is served by Django)
├── vite.config.js        # base + outDir = /static/js/draftboard, dev server :3001
├── package.json          # scripts: dev / build / lint / preview
├── tailwind.config.js
└── src/
    ├── main.jsx          # ReactDOM root → <DraftApp csrfToken={window.csrfToken} />
    ├── features/         # UI components (Draft, DraftBoard, AvailablePlayers, …)
    ├── state_machines/   # draftStateMachine (flow-only XState machine)
    ├── hooks/            # useDraftState, useDraftData, useQueryParams
    ├── lib/              # data.ts (axios API calls), draft.schemas.ts (types)
    └── utils/            # colors, draftHelpers, reordering
```

## Architecture (React side)

- **React 18 + Vite 5**, source is **TypeScript** (`.tsx`/`.ts`) except the two
  bootstrap files `main.jsx` / `App.jsx`.
- **Routing: react-router v6** (`react-router-dom`), set up in `DraftShell.tsx`
  with `basename="/app"`. Routes: `/` (draft list), `/draft/create`,
  `/draft/:draftId` (the board, deep-linkable — `DraftPage.tsx` resolves the id
  param via the draft detail endpoint), `/draft/:draftId/plan` (plan merge),
  `/board/:draftId` (read-only spectator board). Navigation is
  `Link`/`useNavigate`; the old `appStateMachine`/`useDraftAppState`
  screen-switcher was deleted with it.
- **Data: Dexie (IndexedDB) is the client-side database** — see the
  "Client data layer" section below. React Query fetches from the server and
  hydrates Dexie; components read Dexie via `useDraftData` (liveQuery); ALL
  data writes go through `lib/mutations.ts`.
- **State: XState (v5)**, consumed via `@xstate/react`:
  - `draftStateMachine` — FLOW ONLY: nomination, price, drag, slot targeting
    (`DraftFlowContext`). Accessed through `useDraftState()` (singleton actor,
    so flow state survives SPA navigation). It holds NO draft data.
- **HTTP: axios**, all endpoints wrapped in `src/lib/data.ts`. Response/param
  types live in `src/lib/draft.schemas.ts`.
- **Styling: Tailwind CSS v3** (utility classes) plus `index.css` / `custom.css`.
- **Icons:** FontAwesome (`@fortawesome/*`).

## Backend integration

- Django serves the app through **`django-vite`**. The SPA lives at **`/app/`**:
  `fantasy/urls.py` has `re_path(r'^app/', react_draft_entrypoint)` so EVERY path
  under /app/ serves the same entrypoint (client-side routing needs this for deep
  links — add new SPA pages as React routes, never as new Django paths). The view
  renders `templates/draft/index.html` — the **only** live template tied to the
  React app. The old `/draft/react_draft_entrypoint/` URL 302s to `/app/`.
- `index.html` sets `window.csrfToken = "{{ csrf_token }}"` and loads the bundle
  via `{% vite_asset "src/main.jsx" app="draftboard" %}`.
- The React app calls the DRF API under **`/api/drafts/draft/...`** (see the
  functions in `src/lib/data.ts`). New UI data should go through a wrapper in
  `data.ts` + a type in `draft.schemas.ts`, not raw `axios` calls in components.

## Working in the React app

Run everything from `frontend/draftboard/`:

```bash
npm run dev      # Vite dev server on :3001 (HMR); Django serves index.html against it
npm run build    # production bundle → /static/js/draftboard/
npm run lint     # eslint (js,jsx) — max-warnings 0
```

Conventions:

- Match the surrounding code — components in `features/`, one component per file,
  named to match the file.
- Keep API access in `lib/data.ts`; keep types in `lib/draft.schemas.ts`.
- State transitions belong in the XState machines, not ad-hoc `useState` where a
  machine event fits.
- Prefer TypeScript for new files.

## Mobile / touch (the draft board)

`/draft/:draftId` works on a phone. Two things make that possible, and new board
UI has to respect both:

- **Layout.** `hooks/useIsMobile.ts` (matchMedia `max-width: 1023px`, matching
  Tailwind's `lg`) is the single switch. Below it `Draft.tsx` renders ONE tree of
  Players / Board / Budget tabs instead of the sidebar-beside-board
  `.draftboard-grid` — a JS switch, not `lg:hidden`, so the panels aren't
  mounted twice with duplicate filter state. A sticky bar carries the nomination
  (player + winning price + cancel) across tabs. In `DraftBoard`, the position
  rail is a flex sibling of the horizontally-scrolling manager grid, NOT its
  first column: a `position: sticky` grid item can't leave its own grid area, so
  as a column it scrolls away.
- **Tap fallback.** Touch fires no HTML5 drag events, so every drag has a tap
  equivalent, wired on desktop too (one code path): tap a player row to nominate
  (re-nominating while someone is on the block replaces them), tap an empty
  eligible draft/budget slot to place the nominated player, add to the WatchList
  from its header button. Tapping a FILLED slot keeps its old meaning —
  undraft/unbudget. Drop and tap share the same validation helper
  (`placeNomination` in `DraftBoard`), and eligible empty slots are outlined
  blue while a nomination is live.

## Auth & roles

**Everything requires login.** The SPA entrypoint (`react_draft_entrypoint`)
is `@login_required` and DRF's default permission is `IsAuthenticated`
(`fantasy/settings.py`). Login lives at `/login/` (`LOGIN_URL` points there —
it used to point at a nonexistent `/accounts/login/`). The login form is
hand-rendered Tailwind HTML (`templates/registration/login.html`) — crispy-forms
was removed once this became its only consumer; don't reintroduce it.

**No self-service signup or password reset** — deliberately removed; accounts
are created and passwords set only in /admin. `users/admin.py::FUserAdmin`
MUST extend auth's `UserAdmin` (a plain `ModelAdmin` renders the password
column as an editable text field and stores whatever is typed UNHASHED, which
silently breaks login for that account).

**Two tiers, keyed on `is_staff`** (managed in /admin): staff = drafter (full
access), non-staff = spectator. `draft/api/permissions.py::IsDrafter` gates
every write plus the drafter-private reads (available_players, budgeted_picks,
watched_picks, favorite, plans, create/delete draft). Spectator-reachable
endpoints: draft list, detail, managers, picks, board detail, manager_picks,
`/api/me/`.

**Spectators only see flagged drafts.** `Draft.available_to_spectators`
(default False, toggled in the /admin draft list) keeps mockups private:
`DraftReadService.get_drafts` filters the list for non-staff, and
`IsSpectatorVisible` (on every per-draft read view) blocks direct URL/ID
access to unflagged drafts. Flag the real draft before draft day or
spectators see an empty list.

**Superuser sync endpoints** (`IsSuperuser` in `draft/api/permissions.py`):
`/api/drafts/draft/spectator/drafts/` lists drafts flagged
`available_to_spectators`; `/api/drafts/draft/spectator/<draft_id>/drafted_players/`
lists that draft's drafted picks (manager, player, price, slot, timestamps) —
spectator-flagged drafts only, unflagged drafts 404 even for superusers.
Purpose: a local copy of the site polls the hosted deploy to mirror a live
draft. Machine-to-machine auth works out of the box via HTTP Basic
(DRF's default `DEFAULT_AUTHENTICATION_CLASSES` includes `BasicAuthentication`)
with superuser credentials over HTTPS — no token infra needed.

**`/api/me/`** (`users/api.py`) returns `{email, username, is_staff}`;
`DraftShell.tsx` uses it to pick routes — spectators get only the dashboard
(read-only `DraftList` → `/board/:id`) and `SpectatorBoard`. Client gating is
UX only; the server enforces the boundary. Authz tests live in
`draft/tests.py::ApiAuthorizationTests`.

**CSRF:** DRF's `SessionAuthentication` enforces CSRF only on authenticated
requests, so logged-in POSTs 403 unless the token is sent — `lib/data.ts`
configures axios globally (`xsrfCookieName = "csrftoken"`) and every call
inherits it. The `window.csrfToken` snapshot in `index.html` predates this and
is no longer read by API calls. `data.ts` also has a response interceptor that
redirects to `/login/?next=…` when a session expires mid-use.

**Draft day:** the spectator laptop must log in once (any non-staff account)
before opening the board URL; sessions last two weeks by default.

## Hosted deploy (Railway)

`Dockerfile` builds the React bundle and serves via gunicorn + WhiteNoise
(`STORAGES` uses compressed, NON-manifest storage — the Vite bundle is already
content-hashed and manifest hashing would break django-vite's URLs).
Settings are env-driven for hosting: `DATABASE_URL` (takes precedence over the
local `DB_*` vars), `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` (appended from
env), `DEBUG=false`, `VITE_DEV_MODE=false`. Migrations run at container boot.
Platform-side steps, data load/pull, and off-season teardown:
[`RAILWAY_RUNBOOK.md`](./RAILWAY_RUNBOOK.md). The hosted instance is a copy —
the Windows laptop's DB remains the system of record.

## Domain concepts (draft & budget)

This is an **auction fantasy-football draft board**. One manager is the **drafter**
(the app owner, `is_drafter` / `drafterId`); others are opponents. Players are
**nominated** (put on the block), given a **winning price**, then **drafted** to a
manager's roster slot.

**Roster slots** are position-keyed and shared by both the draft board and the
budget panel. Canonical set (server `BUDGET_POSITIONS` / `POSITIONS`):
`QB1, RB1, RB2, WR1, WR2, FLEX1, FLEX2, TE1, DEF1, BENCH1..BENCH7`.

**Slot eligibility** — server `ALLOWED_POSITIONS` (`draft/models.py`), mirrored to
the client as `allowed_positions` on every slot object. New UI MUST honor it:
- `QB` → `QB1` + any `BENCH`
- `DEF` → `DEF1` + any `BENCH`
- `RB` / `WR` / `TE` → own slot(s) (`RB1/RB2`, `WR1/WR2`, `TE1`) + `FLEX1/FLEX2` + any `BENCH`
- any position → any `BENCH`

The server enforces this on every write (`validate_slot_eligibility`); the client
should filter/guard so it never sends an illegal slot.

**The budget panel is the drafter's plan, and it mirrors the drafter's roster.**
Each budget slot holds either a *planned target* (projected price) or an
*actually-drafted* player. `budgetSpent = Σ (actual_price || projected_price)`;
remainder = `starting_budget − budgetSpent`. Because it mirrors the roster,
**drafting a player to the drafter's team overwrites the matching budget slot** —
this is intentional, and `BudgetStagingModal` (see below) exists so a *different*
budgeted player isn't lost silently.

**A budget pick is one row per (draft, manager, player)** on the server
(`budget_pick` = `get_or_create`, updates `position`). So re-budgeting a player at a
new slot **moves** it (no duplicate); the displaced player must be moved or unbudgeted
or two rows collide on one slot.

**Client-vs-server position gotcha:** budget rows must carry the player's real
`position` — a row budgeted this session with an empty `position` breaks
eligibility checks until the next refetch. `mutations.budgetPick` takes the whole
player object for this reason; always pass one that includes `position`.

**Favorite is tri-state** (`Player.favorite`, nullable boolean): `true` = target,
`null` = neutral (the default; legacy `false` rows were migrated to `null`),
`false` = actively avoid. The endpoint **cycles** server-side
(null → true → false → null) rather than taking a value, so each offline-queued
click replays as exactly one step (`DraftWriteService.favorite_player`). UI:
heart is solid/outline/cracked for true/null/false; the nomination area has a
four-way tint — green when the nominated player is budgeted (strongest, wins
over favorite), else yellow/grey/red for favorited/agnostic/unfavorited — with
favorite read from the nominated player's **live** Dexie row (not the
state-machine snapshot, so cycling mid-nomination recolors it). The Favorite
filter and Rebudget only treat `true` as favorited. Ordering gotcha: Postgres
sorts nulls first on `DESC`, so rank explicitly (see `favorite_rank` in
`get_picks`) instead of ordering by `-player__favorite`.

**Player warning flags** — hand-set judgement fields drawn as icons in the
nomination area so the drafter doesn't misprice a bid. All are inline-editable in
/admin (player list, or the TEAM list for coaching). The `good`/`bad` ones use
the shared `IMPACT_CHOICES` and are nullable: **null = no view, draws nothing**,
same tri-state shape as `favorite`.

| flag | lives on | why there |
| --- | --- | --- |
| `is_projection` (bool) | `Player` | the price is a bet on role/health, not delivered production |
| `has_injury` (bool) | `Player` | |
| `coaching_impact` (good/bad) | **`NFLTeam`** | a property of the STAFF — set once, every player on the roster inherits it via `player.team` |
| `defensive_impact` (good/bad) | **`Player`** | one defense cuts BOTH ways by position — a great defense feeds a back (protected leads, running clock) while costing pass catchers their trailing-script volume, so the call is per player |

`defensive_impact` succeeds a derived `hasTheWind` column in `AvailablePlayer`
that inferred the same idea from `team.defensive_ranking` + position; it's now an
explicit human call, which is why it kept the `faWind` icon.

`features/PlayerFlagIcons.tsx` is the single renderer, driven by a `PLAYER_FLAGS`
table; the nomination panel and the mobile sticky bar both use it, so there's no
JSX to touch when adding one. **Adding a flag = one table entry + the model field
+ admin (`list_display`/`list_editable`/`list_filter`/`fields`) + the player
serializer in `api/views/draft.py`.** Two conventions there:

- Each entry carries an `active(player)` PREDICATE, not a field name — that's
  what lets one enum field drive several differently-coloured icons
  (`coaching_impact` → red flag or green flag) beside plain booleans, and what
  lets a flag reach THROUGH a relation (`player.team?.coaching_impact`).
- Colour is the VERDICT and comes from the `BAD`/`GOOD` constants, never an
  ad-hoc hex; the icon is the subject. A glance should read as "how many red
  marks", with green only where something counts in the player's favour.

FontAwesome free has no projector, whistle, or referee icon (all Pro) — hence
`faFilm` and `faFlag` as stand-ins. A flag on a RELATED model also needs its
field on the nested serializer (coaching is on `NFLTeamOutputSerializer` inside
the player payload, not the player serializer). Tooltips use `features/InstantTooltip.tsx`
(CSS-only `group-hover`), NOT the native `title`, whose ~1s OS-level delay is
useless mid-bid.

Flags reach the client through the hand-written player serializer inside
`DraftPicksOutputSerializer`, and from there ride into Dexie untouched (`player`
is stored wholesale) and out to `nominatedPlayer`. `NominationArea` reads them
off the LIVE Dexie row, like `favorite`, so flipping one in /admin mid-draft
shows up on the next refetch. A field silently missing from that serializer means
the warning simply never fires — hence the passthrough test in
`draft/tests.py::PlayerProjectionFlagTests`.

**Years experience** (`Player.years_experience`, non-negative int, default `0`) —
completed NFL seasons, **hand-set in /admin** (`list_editable`, `list_filter`);
no importer writes it, so `0` means "rookie OR not filled in yet" and the two are
not distinguishable. Filter-only: nothing renders it. Both apps filter it with the
same **mode + value pair** — `=` or `≤`, and an empty VALUE (not a zero) is what
turns the filter off, since 0 is a meaningful selection here. **`≤ N` spans 1…N
and EXCLUDES 0** — the filter's job is finding young players, and because 0 also
means "not filled in yet" a ceiling that included it would return every unset
player; `= 0` is how you go after the zeros deliberately (so `≤ 0` matches
nobody, by design). It rides to the
board through `DraftPicksOutputSerializer`'s player serializer (and so into Dexie
with the rest of `player`) and to the mock page through
`MockDraftPlayerOutputSerializer`; a field missing from either means the filter
silently matches nothing, hence the passthrough asserts in
`draft/tests.py::YearsExperienceTests`.

**Target tiers** (`Player.target_tier`, non-negative int, default `0` = untiered;
`1` is the TOP tier and they ascend). Prep-time tiering, not a draft-time write:
the app has no endpoint that sets it — you tier players **inline in /admin's
player list** (`PlayerAdmin.list_editable = target_tier, favorite,
override_price`; `player_id` stays the link column, so it can never join
`list_editable`). Read side: `GET /api/drafts/draft/<id>/target_tiers/`
(`IsDrafter`) → `[{tier, players: [...]}]`, best tier first,
`DraftReadService.get_target_tiers`. **Availability comes from `DraftPick`
(`drafted=False`), not from `Player`** — tiers are per draft, so a player taken
in another draft still shows here. Tier 0 is excluded entirely; within a tier,
players sort by `override_price || projected_price` desc.
Because tiering is hand-done in /admin, it lives on one machine and has to be
carried to the others: `write_target_tiers_to_csv` dumps `<year>_target_tiers.csv`
(repo ROOT — `data/` is stripped from the builds) and
`update_player_target_tiers` replays it. The file is the source of truth (tiered
players it omits are reset to 0; `--no-clear` opts out), matching is on
`(player_id, year)`, and it writes with `queryset.update()` because
`Player.save()` would rewrite `projected_price`. Deploy-then-run via
`railway ssh` as usual — see "Push target tiers up" in `RAILWAY_RUNBOOK.md`.

UI: `features/TargetTiers.tsx` is the component (one column per tier,
position-filter chips, 15s poll) and it renders in TWO places — a collapsible
section **under the draft board** in `Draft.tsx` (shown by default; the "Tiers ▾"
button brings it back after Hide) and the full-page `TargetTiersPage.tsx` at
`/draft/:draftId/tiers`. Keep rendering in the shared component so the two can't
drift. React Query dedupes the `["target_tiers", draftId]` key, so both mounted
at once still cost one request. NOT on `SpectatorBoard` — tiers are the
drafter's targets and forecasting them is exactly what that view withholds.

It reads the server DIRECTLY (React Query), **not** through Dexie — a read-only
view that never writes has no reason to enter the offline pipeline. The board's
copy additionally takes `hidePlayerIds` (drafted player_ids projected from the
LOCAL Dexie rows) so a pick you just submitted drops out of the tiers at once
instead of lingering until the next poll.

The tier strip scrolls HORIZONTALLY ONLY, and has **no height cap of any kind** —
not per column, not on the strip. Under `items-start` every column is exactly as
tall as its contents, so the ragged bottoms show how deep each tier is at a
glance (the count badge in each header says it exactly); any vertical cap
flattens the columns to one height and destroys that signal. This is a
deliberate user preference — don't reintroduce a `max-h-*` here. Vertical
scrolling belongs to the enclosing page / board column. Tier headers are
`sticky top-0` so the label and count survive that scroll.

**Board page scrolling — the PAGE scrolls, nothing nests its own scrollbar.**
Placing the tier strip under the board forced two fixes, and both are load-bearing
for anything else added below the grid:

- `.draftboard-grid` no longer sets `height: 100vh` on desktop (`custom.css`).
  That pin made the grid exactly one viewport tall, so anything under the board
  had to live in an inner scroll container — the page scrollbar did nothing and
  you had to find and scroll the board column instead. The grid now sizes to
  content. Don't reintroduce the height, and don't give `.draft-main` an
  `overflow-y` to compensate.
- `body` is start-aligned, not centered (`index.css`). It's a flex container, and
  Vite's template `place-items: center` centered it vertically; a centered flex
  item taller than the viewport overflows in BOTH directions, so the top of the
  page gets clipped with no way to scroll up to it. (This replaces the
  mobile-only `align-items: flex-start` override that used to live in
  `custom.css` for the same reason.)

- The desktop tracks are `fit-content(45vw) minmax(0, 1fr)`, not `auto auto`.
  Two `auto` tracks SHARE free space, which cost it both ways: the board column
  (and anything under it) squeezed the sidebar tables into wrapping, and with a
  short board the sidebar track stretched into a blank gap beside the budget
  panel. Content-sizing the sidebar and giving the board `minmax(0, 1fr)` —
  which absorbs ALL the slack, and whose `0` min lets it shrink past its content
  into its own `.draft-board-scroll` — fixes both. The `45vw` cap keeps a long
  player name from swallowing the board.

The tier strip renders after `.draftboard-grid` as a full-width sibling, under
the sidebar and board together (a user preference — it's a wide horizontal
strip). That placement is only gap-free because of the track sizing above.

**Clicking a tier player opens `BudgetStagingModal`** — see its own section
below; it's shared with the drafting path.

**Winning-price gotcha:** the nominated-player object (`draftContext.nominatedPlayer`)
has NO `.price` — the winning bid lives in `draftContext.nominationPrice`, threaded
around as a separate `price`. Using `player.price` for a budget projected price renders
`NaN` (via `parseInt(undefined)`) and poisons `budgetSpent`.

**`submit_pick` also writes a PlanChange.** The submit view does
`get_budgeted_player(slot)` → `submit_pick` → `update_plan_changes` (records that the
drafted player differs from the budgeted one). `PlanChange` is `unique_together('draft',
'position')`, so `update_plan_changes` MUST use `update_or_create` (not `create`) and
guard a `None` pick — otherwise re-drafting a slot 500s, which surfaces on the client as
"the pick submitted but the board didn't update" (the optimistic budget change lands, but
the `draftPickSubmit` promise rejects so `draft_player` never fires).

## Player data import (FFC ADP)

`add_players` / `refresh_player_adp` (same import; the latter is the in-season
alias) pull the Fantasy Football Calculator ADP API for the current year and
upsert players: team link, `adp_formatted`, and `projected_price` (= average
`HistoricalDraftPicks` auction price at each ADP rank). Shared helpers live in
`add_players.py` (`get_data`, `get_or_create_team`, `compute_average_adp_prices`,
`load_ffc_json`) — `refresh_player_adp` and `add_nfl_teams` import from it, so
change the import there, once.

- Missing `NFLTeam` rows are created on the fly (`get_or_create` keyed
  code+year — the year matters; unkeyed lookups grabbed other seasons' rows on
  the historical DB). `add_nfl_teams` still exists to seed teams alone, also
  API-driven and idempotent now.
- **A DB without `HistoricalDraftPicks` gets no price updates** — the import
  warns and preserves existing prices rather than flattening them (the dev Mac
  DB is in this state; `add_default_prices --update` applies the hardcoded
  curve by ADP order instead).
- Refreshing the Railway instance: see "Refresh ADP / prices in-season" in
  `RAILWAY_RUNBOOK.md` — run the DEPLOYED command via
  `railway ssh --service app -- python manage.py refresh_player_adp`.
  NEVER point a local process at the hosted DB (`DATABASE_URL=<public URL>`
  or ad-hoc SQL) — it bypasses all app-level controls; deploy first, then
  run the command server-side.
- `relink_player_teams_for_current_year` repoints players stuck on another
  season's team row (legacy of the unfiltered lookup; also off-feed players,
  since the refresh only relinks players present in the FFC feed). Run it
  once after the first refresh on a DB with pre-fix data — cleaned 14 such
  links on the Railway DB (2026-08-02).

## Client data layer (Dexie/IndexedDB)

**Dexie is the client-side database; XState holds flow only.** The pieces:

- `lib/db.ts` — the `draftboard` DB. Tables modeled on the SERVER's rows, not
  the UI's lists: `draft_picks` (one row per draft+player, keyed
  `[draftId+player_id]`; "available" is just `drafted === false`),
  `budget_picks`, `watch_picks`, `draft_meta` (details + manager identities +
  slot template; manager budgets are DERIVED from drafted rows, never stored).
  Row types live in `lib/draft.schemas.ts` (`DraftPickRow`, `BudgetPickRow`, …).
- **Hydration**: React Query fetches in `Draft.tsx`; on success `hydrateDraft`
  replaces that draft's rows wholesale in one transaction — the server stays
  the source of truth whenever reachable. If the server is down, the queries
  fail and last session's rows simply remain: offline viewing needs no restore
  mechanism (the only offline signal is the waiting-to-sync counter below).
- **Reads**: `hooks/useDraftData.ts` projects the tables (via `useLiveQuery`)
  into the legacy `draftContext` shapes components consume (`managers` with
  slot maps, `undraftedPlayers`, `budgetedPlayers`, `watchedPlayers`,
  `budgetSpent`). Components re-render automatically on any row change.
- **Writes**: `lib/mutations.ts` is THE mutation seam — every data change is
  one Dexie transaction paired with its API call. Components never write Dexie
  or call pick/budget/watch endpoints directly. `submitPick`/`setFavorite` are
  server-first (server validates / may override); everything else is
  optimistic.
- **Offline write-queue** (`lib/writeQueue.ts`, `pending_writes` table): every
  mutation API call goes through `sendOrQueue`/`sendOrQueueWithResponse` —
  direct when reachable, queued on NETWORK failure (and whenever older writes
  are already queued, to preserve ordering, e.g. unbudget-before-budget).
  Flushed FIFO on 'online', a 10s heartbeat, and app load. Replay policy: a
  network failure stops the flush (retry later); a server REJECTION drops the
  op (hydration reconciles). While a draft has pending writes, `hydrateDraft`
  SKIPS that draft (server data is behind the local rows) and `Draft.tsx`
  shows an orange "N changes waiting to sync" strip in the title row
  (`data.pendingWrites`).
  Offline, `submitPick` accepts picks optimistically instead of failing —
  losing picks mid-draft is worse than a rare replay rejection.
- **Flow state** (`draftStateMachine` / `useDraftState`): nomination, price,
  drag, slot targeting — a module-scope singleton actor so it survives SPA
  navigation. `Draft.tsx` sends `reset_flow` when the draft id changes.
- **Never coerce `player_id` on its way into a mutation.** IndexedDB compound
  keys are TYPE-SENSITIVE, and the server sends `player_id` as a number, so
  `budget_picks.delete([draftId, "2"])` silently misses the row stored at
  `[draftId, 2]`. The failure is deceptive: the API call still succeeds, so the
  change looks lost locally but correct after any refetch ("it only removed the
  player once I refreshed"). Stringify for map keys and comparisons only — see
  `utils/budgetStaging.ts`, which keeps the raw id on every occupant and does
  lookups through a separate `key()`.
- **Schema changes** in `db.ts` APPEND a new `this.version(n)` block (Dexie
  upgrades browsers sequentially); never edit or remove an existing block.

**Spectator board & LAN serving (draft day)** — `features/SpectatorBoard.tsx` at
`/board/:draftId`: read-only board grid polling every 5s; intentionally hides
available players / budget / watchlist (don't forecast the drafter's targets) and
intentionally reads straight from its queries, NOT the Dexie pipeline (passive
viewer, usually a different machine, never writes). To serve to a second laptop:

```bash
# macOS/Linux host (LAN IP: `ipconfig getifaddr en0` on Mac)
cd frontend/draftboard && npm run dev          # Vite already binds 0.0.0.0
VITE_DEV_HOST=<this-machine's-LAN-IP> .venv/bin/python manage.py runserver 0.0.0.0:8100
```

```powershell
# Windows host — the ACTUAL draft-day machine (LAN IP: `ipconfig` → Wi-Fi IPv4)
cd frontend\draftboard ; npm run dev           # terminal 1
$env:VITE_DEV_HOST = "<this-machine's-LAN-IP>" # terminal 2, repo root
.venv\Scripts\python manage.py runserver 0.0.0.0:8100
```

Spectator laptop needs only a browser → `http://<LAN-IP>:8100/app/board/<draft_id>`
(logged in with a spectator account — see "Auth & roles").

`VITE_DEV_HOST` matters: django-vite writes that host into the dev script tags,
and `localhost` would point the second laptop at itself (page loads, stays
blank). `ALLOWED_HOSTS` is wildcarded only under DEBUG.

**Built-bundle mode (`VITE_DEV_MODE=false`)**: `npm run build` outputs to
`dist/js/draftboard/` (with a Vite manifest at `.vite/manifest.json`, wired up
via `manifest_path` in `DJANGO_VITE`), and running Django with
`VITE_DEV_MODE=false` serves that bundle instead of pointing browsers at the
Vite dev server — no Vite terminal, no `VITE_DEV_HOST`. This is REQUIRED when
viewers can't reach port 3001, e.g. serving remote spectators through a
Cloudflare quick tunnel — see [`TUNNEL_RUNBOOK.md`](./TUNNEL_RUNBOOK.md) for
the Windows draft-day steps — and also works for plain LAN serving. Rebuild
after frontend changes; dev mode (HMR) is unchanged and remains the default.

Draft-day gotchas: allow Python AND Node through Windows Firewall on Private
networks (the prompt appears on first listen); venue wifi may isolate devices —
fallback is Windows Mobile hotspot on the host with the spectator joining it.
Dress-rehearse the two-laptop setup before the draft.

**DraftPlan (`draft/models.py`)** — a standalone, reusable roster plan: `name`,
`year`, and one nullable Player FK per slot (`qb1` … `bench7`, lowercase of
`DRAFT_PLAN_SLOTS`). Deliberately NO FK to draft or user, so any draft can pull any
plan in. Players only, no prices — applying a plan prices players from their
projected/override price. Created from a mock draft by snapshotting the **drafter's
actual drafted picks** (`DraftPlanWriteService.create_from_draft`). Endpoints under
`/api/drafts/draft/`: `plans/` (list, `?year=` filter), `plans/<id>/`,
`plans/<id>/delete/`, `<draft_id>/create_plan/`. Services in
`draft/services/draft/draft_plan.py`. Purpose: mid-draft budget pivots — swap a
predefined plan into the budget panel instead of editing slots under time pressure
The consuming UI is `features/DraftPlanPage.tsx` at route `/draft/:draftId/plan`
("Plans" button on the board): select a plan, then a per-slot checkbox picker
merges it into the budget — mergeable slots default CHECKED; slots whose budget
row is an actually-drafted player default UNCHECKED (protected but overridable);
plan players already drafted by anyone are disabled. Apply goes through
`mutations.applyPlanSelections` (unbudget displaced occupant → budget plan player,
per slot — the unbudget matters or the displaced server row reclaims the slot on
refetch). Plan players are priced `override_price || projected_price`. The page
reads the draft via `useDraftData`, so the board must have been opened once to
hydrate Dexie.

**MockDraft / MockPick (`draft/models.py`)** — a plan sketchpad: ONE roster of the
16 canonical slots, a player and a price in each, and nothing else. No managers,
no opponents, no per-player `DraftPick` fan-out. It exists because the only way
to author a `DraftPlan` used to be creating a whole empty `Draft` and drafting
into it; a MockDraft gets to the same plan directly
(`DraftPlanWriteService.create_from_mock_draft`, which shares its slot-copy with
`create_from_draft` via `build_plan`). Like DraftPlan it has NO FK to a draft or
a user.

- `MockPick` is the M2M through row of `MockDraft.players`, `unique_together`
  BOTH ways: `(mock_draft, position_slot)` and `(mock_draft, player)`. So
  `MockDraftWriteService.set_pick` resolves both collisions itself — the player
  MOVES if they already sit in another slot, and the incumbent of the target slot
  is DROPPED (the client shows slot contents, so picking a filled slot is a
  deliberate replacement). Slot eligibility reuses
  `validate_slot_eligibility`, so the same `ALLOWED_POSITIONS` rules apply.
- `price` on MockPick is the mock's OWN budgeted number, editable per slot; the
  serializer also sends `projected_price` (`override_price || projected_price`)
  so the UI can show cost against market. `budget_spent` / `budget_remaining` are
  model properties over the picks — nothing is stored.
- Availability comes straight from `Player` (the mock's `year`, minus its own
  picks, minus positions no slot can hold — see `SLOTTABLE_POSITIONS`), NOT from
  DraftPick like a real draft's available_players.
- Endpoints, all `IsDrafter`, under `/api/drafts/draft/mocks/`: `` (list,
  `?year=`), `create/`, `<id>/`, `<id>/delete/`, `<id>/available_players/`,
  `<id>/pick/<player_id>/` (`{position_slot, price}`), `<id>/clear_slot/`
  (`{position_slot}`), `<id>/create_plan/` (`{name}`). Every write answers with
  the FULL mock detail (slots + budget), so the client seeds its cache from the
  response instead of refetching. Services in
  `draft/services/draft/mock_draft.py`.
- UI: `features/MockDraftList.tsx` (a section on the dashboard, staff only —
  create takes just a name) and `features/MockDraftPage.tsx` at `/mocks/:mockId`
  — roster on the left, player list on the right. Its filters mirror the board's
  `AvailablePlayers` set and semantics (name search, position chips, max price as
  a CEILING on `override_price || projected_price`, a team dropdown built from the
  loaded players, and Favorites-only counting `favorite === true` alone), but
  apply LIVE rather than behind a Filter button. Click
  a player, then click an eligible slot; eligible empty slots are outlined blue,
  which is the board's tap-to-place idiom. "Save as plan" prompts for a name and
  posts `create_plan`. It reads the server DIRECTLY through React Query — **not**
  Dexie and not the offline write queue — because mocks are prep-time work, same
  reasoning as Target Tiers.

**Running backend tests**: `.venv/bin/python manage.py test draft --keepdb` —
requires the `fantasymanager-db` Docker container running
(`docker start fantasymanager-db`, Postgres on :5434). `fantasy/settings.py` sets
`TESTING = 'test' in sys.argv` and strips `debug_toolbar` from apps/middleware
under tests (it refuses to run when Django forces DEBUG=False).

`--keepdb` reuses the test database instead of rebuilding and dropping it every
run (1.9s → 1.4s today, and the gap widens as the migration count grows — it's
skipping a full replay of all 81 migrations). New migrations still get applied to
the kept DB, so it stays correct as the schema moves. The exception is EDITING or
DELETING an existing migration, which can leave the kept DB drifted from the
graph and fail confusingly — run once without the flag to rebuild it.

**Testing philosophy (standing rule): test business logic only.** Do NOT write
tests that exercise well-established framework behavior — DRF
serialization/routing, Django ORM CRUD, admin plumbing, auth machinery. Worth
testing: this repo's services (draft/budget/plan rules), custom permission
classes (the drafter/spectator boundary), and any hand-written passthrough
where a field could silently get dropped. When in doubt, ask "does this assert
OUR logic, or that Django works?" — skip the latter.
**Rebudget** (`utils/strategyShuffle.ts` + `features/RebudgetModal.tsx`,
"Rebudget" button on the board): proposes a revised budget from FAVORITED
undrafted players only. Pure client-side. The modal shows the full roster —
drafted players (grayed, always locked) and current budget picks — with a
🔒 checkbox per budgeted slot: LOCKED slots keep their player and planned
dollars; UNLOCKED slots are shuffled. Default locks: when the current plan
is OVER budget, `defaultUnlockedSlots` unlocks the priciest budgeted players
until their planned dollars cover the overage (the "downgrade someone"
case); otherwise everything budgeted starts locked. Empty slots always
shuffle. The header shows $X OVER/UNDER BUDGET for the current plan.

The shuffle itself: builds a ladder of dollar RUNGS per strategy
(cheap-bench / even / laddered ≈ 73% geometric decay) over the unlocked
slots and uncommitted budget, then biggest-rung-first randomly picks a
favorite priced within ±variation (user-set, default $2) of the rung. Rungs
are SLOT-AGNOSTIC: the slot is an outcome, chosen after the player —
most-specific eligible slot first (TE1 before FLEX before BENCH) so
flex/bench stay open for later rungs. Rungs with no fitting favorite stay
EMPTY by design (unfilled slots keep their current occupant on apply; note
under the table suggests re-roll / widen ±$ / favorite more players). DEF
contributes a $1 rung in every strategy (same convention as BudgetPerSlot).
Apply reuses `mutations.applyPlanSelections` and only touches unlocked slots
that received a proposal; budget rows get the PLAYER's price, not the rung
target (user's choice — totals approximate the strategy).

**Budget-per-remaining-slot** (`utils/draftHelpers`): two color-coded strips
(`features/BudgetPerSlot.tsx`) in the sidebar directly below the Nomination area.
Formula: `(remaining − 1) / (openSlots − 1)` — the two `−1`s reserve $1 for the DEF
slot, which should never cost more; denominator clamps at 1; `null` (strip hidden)
when there are no open slots. Two scopes: `budgetPerRemainingSlot` over the drafter's
**actual** roster ("/draft slot"), and `budgetPerRemainingBudgetSlot` over the
**budget plan** ("/budget slot", remaining = `starting_budget − budgetSpent`). Color
scale in `utils/colors.getBudgetPerSlotColors`: ≤1 bright red, 1–2 orange-red,
2–5 yellow, >5 green.

**Key data shapes** — typed in `lib/draft.schemas.ts` (`PickSlot`, `SlotPick`,
`SlottedManager`, plus the Dexie row types). The projected view shapes:
- Budget slot: `{ order, allowed_positions: string[], pick: { player_id, player_name, position, projected_price, actual_price, price, budget_position, status, ... } }`, keyed by slot name. Empty pick ⇒ `player_id === ""`.
- Manager: `{ manager_id, manager_name, manager_position, manager_budget, is_drafter, draft_picks: { [slot]: { allowed_positions, position_slot, pick: {...} } } }`.

**Relevant endpoints** (wrapped in `lib/data.ts`): `submit_pick` / `unsubmit_pick`,
`budget_pick` / `unbudget_pick`, `reslot_picks` / `reslot_budget`, `watch`,
`available_players`, `manager_picks`, `budgeted_picks`, `watched_picks`.

**BudgetStagingModal** (`features/BudgetStagingModal.tsx`) — ONE staged editor
behind both ways of working a player into the budget. It replaced
`BudgetConflictModal` (deleted), which could only trade one player for one slot;
making room usually means dropping SEVERAL players and MOVING the incumbent
rather than losing them.

Nothing in it is a swap. Slots and an "out of the budget" tray are two ends of
one staging area: ✕ drops a player to the tray (and arms them, so removing and
moving are the same gesture), clicking a tray player then a slot places or moves
them, and whatever is still in the tray on confirm gets unbudgeted. **Nothing is
written until confirm** — which is what lets the drafting path treat Cancel as
"abandon the pick, touch nothing".

Two entry points, differing only in `pinnedSlot` (`utils/budgetStaging.ts::initialStaging`):

- **Tier board** (`Draft.tsx`, `TargetTiersPage.tsx`) — `pinnedSlot` null. The
  player starts in the tray, armed, priced from the projection; the user picks
  the slot. Confirm just applies.
- **Drafting** (`DraftBoard.tsx`, when the drafter drafts into a budget slot
  holding a *different* player) — `pinnedSlot` is the drafted slot, because the
  budget MIRRORS the roster so the slot isn't a choice. The player is pre-placed
  there, locked, at the WINNING price; whoever they displaced starts in the tray
  pre-armed. Confirm applies the rearrangement and then `submitPick`s
  (`DraftBoard.resolveConflict`) — the budget must be arranged BEFORE submit,
  since the server's submit view reads the budget slot to record `PlanChange`s.
  Either way `initialStaging` first clears the incoming player from any slot they
  already hold, so drafting someone already budgeted elsewhere can't stage them
  twice.

The pure logic is `utils/budgetStaging.ts` (same split as
`strategyShuffle.ts`/`RebudgetModal`); `lib/mutations.ts::applyBudgetChanges`
commits it. Three things there are load-bearing:

- **`unbudget` is REMOVALS ONLY — never movers.** `budget_pick` get_or_creates
  on `(draft, manager, player)` so re-budgeting MOVES the row, but
  `unbudget_pick` nulls the row's `manager`, so unbudget-then-budget on one
  player no longer matches and creates a SECOND `BudgetPlayer` row. A mover is
  re-placed and nothing else.
- That's only safe because staging guarantees **every displaced player is either
  re-placed or removed** — never dropped. `budgetPick` clears the target slot in
  Dexie only, with no server counterpart, so an orphaned row reclaims its slot
  on the next hydrate.
- Removals are applied before placements, sequentially (the write queue replays
  FIFO).

The modal FREEZES its slot snapshot and baseline on open (`useState` initializer,
not `useMemo`): `budgetedPlayers` is a live Dexie projection, so a pick landing
mid-edit would otherwise move the baseline out from under the staged assignments
and diff against a plan the user never saw.

**The modal edits the BUDGET only — it never writes `DraftPick`.** `applyBudgetChanges`
reaches only `budgetPick`/`unbudgetPick` → `budget_pick`/`unbudget_pick` →
`BudgetPlayer`. The one place drafted state changes is `submitPick`, called from
`DraftBoard` alone (`finalizeDraft`, and `resolveConflict` after the budget is
arranged). Keep it that way: the two concepts are distinct, and a tier player
being *budgeted* is not being *drafted*.

That separation is exactly why `StagedOccupant.locked` matters. It covers the pin
and — via `draftedPlayerKeys` — every player the DRAFTER has already drafted,
keyed on the PLAYER, not the slot. A slot-matched check looks right (drafting
budgets at the matching slot) but silently lapses once that budget row is moved
by the budget panel's drag-reslot or by this modal, and an unlocked drafted
player can then be unbudgeted — leaving the pick standing with no budget row,
since nothing here can undo the pick itself. Players an OPPONENT drafted are
deliberately NOT locked: a stolen target isn't final for the plan and has to stay
removable.

> Note: `features/PlanChanges.tsx`, `features/PlanChangesModal.tsx`, and the
> `planChanges` context field are an earlier attempt at surfacing budget overwrites in
> the UI — **never rendered/wired**; the conflict/staging modal superseded the intent.
> (The *backend* half — the `PlanChange` model + `update_plan_changes` — DOES run on
> every drafter pick.) Consolidate rather than extend the dead frontend pieces.

**Backups** (`features/BackupPicks.tsx`, `backup_picks` in Dexie v6) — a shelf of
pre-picked alternates **behind each BUDGET SLOT**: the WR1 shelf says who takes
WR1 if the WR1 target gets bought by someone else, so the swap is one click
instead of a plan rebuilt under time pressure. `BACKUP_DEPTH` (3) cells per
slot, addressed by `(slot, rank)`. Deliberately narrow in scope:

- **LOCAL ONLY.** No endpoint, no `BudgetPlayer` row, nothing in the offline
  write queue — `backupPick` / `unbackupPick` are the only mutations in
  `mutations.ts` that never talk to the server, and `hydrateDraft` leaves
  `backup_picks` alone (a refetch has no opinion on them, and wiping them would
  lose the feature on every load). They live and die on one browser; a
  draft-day machine swap loses the shelf, which is accepted.
- **Not the budget.** Backups are absent from `budgetSpent` — a candidate is not
  a commitment. But they ARE slot-specific, so a backup must satisfy its slot's
  `allowed_positions` like any other candidate for it (guarded on drop and tap,
  with the board's blue-outline affordance on eligible empty cells).
- One row per player, like `budget_picks`, so parking someone already parked
  MOVES them; filling an occupied cell replaces its occupant.
- **In:** drop an available player on a cell, or tap a cell while someone is
  nominated (priced from the projection, matching the budget panel). **Out:** ✕
  clears a cell; clicking a filled cell calls `mutations.promoteBackup`.
- **Promotion is a SWAP, not a replacement** — the displaced budget occupant
  lands in the cell the promoted player just vacated, so the plan never loses a
  player it had picked out and a second click puts things back. The budget half
  goes through `applyBudgetChanges` to inherit its ordering contract; the
  occupant is genuinely leaving the budget, so unbudgeting them is correct here.
  No staging modal: the slot isn't a choice, which is the whole point of keying
  shelves to slots.
- Two guards, both `alert()` like the budget panel's ineligible tap: a backup
  the field has already drafted can't be promoted (struck through and labelled
  with who took them, read from the LOCAL manager projections so a pick made
  this session counts at once), and a slot whose budget row mirrors one of the
  DRAFTER's own picks is settled — nothing in this panel can undo a pick, so
  promoting over one would leave the pick with no budget row. Same reasoning as
  `StagedOccupant.locked`, and keyed on the PLAYER for the same reason.
- **Expand** is the only layout switch: collapsed it is a compact
  slot × B1/B2/B3 table at the bottom of the sidebar column (slot order matches
  the budget table, so the two read side by side); expanded (desktop)
  `Draft.tsx` adds `.with-backups` to `.draftboard-grid` and the panel moves
  into its own middle track (`minmax(22rem, 34vw)`, clamped because a
  `fit-content` track jitters as cells fill), which also shows each slot's
  current budget occupant and prices. Since the board is the only `1fr` track,
  every rem the backups take comes off the board — intentional: this is
  secondary functionality that only gets room when asked. On mobile there is one
  column, so the panel stays in the Budget tab and only the cells widen.

## Do not

- Do not treat `static/js/`, `static/css/draftboard.css`, or the jQuery-era
  `templates/draft/draftboard.html` family as source of truth — they are dead.
- Do not add new UI to Django templates. New UI goes in the React app.
- Do not delete suspected-stale files without verifying against
  `DEFUNCT_ARTIFACTS.md` and live view usage first.

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
  param via the draft detail endpoint). Navigation is `Link`/`useNavigate`; the
  old `appStateMachine`/`useDraftAppState` screen-switcher was deleted with it.
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
this is intentional, and the `BudgetConflictModal` (see below) exists so a *different*
budgeted player isn't lost silently.

**A budget pick is one row per (draft, manager, player)** on the server
(`budget_pick` = `get_or_create`, updates `position`). So re-budgeting a player at a
new slot **moves** it (no duplicate); the displaced player must be moved or unbudgeted
or two rows collide on one slot.

**Client-vs-server position gotcha:** budget rows must carry the player's real
`position` — a row budgeted this session with an empty `position` breaks
eligibility checks until the next refetch. `mutations.budgetPick` takes the whole
player object for this reason; always pass one that includes `position`.

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
  mechanism, just the warning banner in `Draft.tsx`.
- **Reads**: `hooks/useDraftData.ts` projects the tables (via `useLiveQuery`)
  into the legacy `draftContext` shapes components consume (`managers` with
  slot maps, `undraftedPlayers`, `budgetedPlayers`, `watchedPlayers`,
  `budgetSpent`). Components re-render automatically on any row change.
- **Writes**: `lib/mutations.ts` is THE mutation seam — every data change is
  one Dexie transaction paired with its API call. Components never write Dexie
  or call pick/budget/watch endpoints directly. `submitPick`/`setFavorite` are
  server-first (server validates / may override); everything else is
  optimistic. A future offline write-queue replaces the API calls in this one
  file and nothing else moves.
- **Flow state** (`draftStateMachine` / `useDraftState`): nomination, price,
  drag, slot targeting — a module-scope singleton actor so it survives SPA
  navigation. `Draft.tsx` sends `reset_flow` when the draft id changes.
- **Schema changes** in `db.ts` APPEND a new `this.version(n)` block (Dexie
  upgrades browsers sequentially); never edit or remove an existing block.

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
(the `/draft-plan` page consuming this is planned, not yet built).

**Running backend tests**: `.venv/bin/python manage.py test draft` — requires the
`fantasymanager-db` Docker container running (`docker start fantasymanager-db`,
Postgres on :5434). `fantasy/settings.py` sets `TESTING = 'test' in sys.argv` and
strips `debug_toolbar` from apps/middleware under tests (it refuses to run when
Django forces DEBUG=False).
**Budget-per-remaining-slot** (`utils/draftHelpers.budgetPerRemainingSlot`): shown as a
color-coded strip (`features/BudgetPerSlot.tsx`) in the sidebar directly below the
Nomination area. Formula:
`(manager_budget − 1) / (openSlots − 1)` over the drafter's **actual** roster
(`draft_picks`, not the budget plan) — the two `−1`s reserve $1 for the DEF slot, which
should never cost more. Denominator clamps at 1; returns `null` (badge hidden) when the
roster is full. Color scale in `utils/colors.getBudgetPerSlotColors`: ≤1 bright red,
1–2 orange-red, 2–5 yellow, >5 green.

**Key data shapes** — typed in `lib/draft.schemas.ts` (`PickSlot`, `SlotPick`,
`SlottedManager`, plus the Dexie row types). The projected view shapes:
- Budget slot: `{ order, allowed_positions: string[], pick: { player_id, player_name, position, projected_price, actual_price, price, budget_position, status, ... } }`, keyed by slot name. Empty pick ⇒ `player_id === ""`.
- Manager: `{ manager_id, manager_name, manager_position, manager_budget, is_drafter, draft_picks: { [slot]: { allowed_positions, position_slot, pick: {...} } } }`.

**Relevant endpoints** (wrapped in `lib/data.ts`): `submit_pick` / `unsubmit_pick`,
`budget_pick` / `unbudget_pick`, `reslot_picks` / `reslot_budget`, `watch`,
`available_players`, `manager_picks`, `budgeted_picks`, `watched_picks`.

**BudgetConflictModal** (`features/BudgetConflictModal.tsx`): raised from
`DraftBoard.handleDrop` when the drafter drafts into a budget slot already holding a
*different* player. Lets the owner keep the displaced player (move to an eligible open
slot) and drop other budgeted players to fit the remaining budget. Confirm is advisory
(always enabled). The resolution is applied by `DraftBoard.resolveConflict` as a
sequence of `lib/mutations.ts` calls (unbudget drops → move displaced → budget the
drafted player → submit).

> Note: `features/PlanChanges.tsx`, `features/PlanChangesModal.tsx`, and the
> `planChanges` context field are an earlier attempt at surfacing budget overwrites in
> the UI — **never rendered/wired**; `BudgetConflictModal` superseded the intent.
> (The *backend* half — the `PlanChange` model + `update_plan_changes` — DOES run on
> every drafter pick.) Consolidate rather than extend the dead frontend pieces.

## Do not

- Do not treat `static/js/`, `static/css/draftboard.css`, or the jQuery-era
  `templates/draft/draftboard.html` family as source of truth — they are dead.
- Do not add new UI to Django templates. New UI goes in the React app.
- Do not delete suspected-stale files without verifying against
  `DEFUNCT_ARTIFACTS.md` and live view usage first.

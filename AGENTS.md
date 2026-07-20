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
    ├── state_machines/   # XState machines (app-level + draft-level)
    ├── hooks/            # useDraftAppState, useDraftState, useQueryParams
    ├── lib/              # data.ts (axios API calls), draft.schemas.ts (types)
    └── utils/            # colors, draftHelpers, reordering
```

## Architecture (React side)

- **React 18 + Vite 5**, source is **TypeScript** (`.tsx`/`.ts`) except the two
  bootstrap files `main.jsx` / `App.jsx`.
- **State: XState (v5)** state machines, consumed via `@xstate/react`:
  - `appStateMachine` — top-level flow: `loading → selecting → creating/drafting`.
    Accessed through `useDraftAppState()`.
  - `draftStateMachine` — per-draft board state (players, picks, budgets,
    watchlist, reordering). Accessed through `useDraftState()`.
  - UI components dispatch events via the machine's `send(...)`.
- **Server state: TanStack React Query** (`@tanstack/react-query`) for fetching;
  fetched data is pushed into the XState machines via events (see `Draft.tsx`).
- **HTTP: axios**, all endpoints wrapped in `src/lib/data.ts`. Response/param
  types live in `src/lib/draft.schemas.ts`.
- **Styling: Tailwind CSS v3** (utility classes) plus `index.css` / `custom.css`.
- **Icons:** FontAwesome (`@fortawesome/*`).

## Backend integration

- Django serves the app through **`django-vite`**. The entrypoint view is
  `draft.views.react_draft_entrypoint` (URL name `react_draft_entrypoint`),
  rendering `templates/draft/index.html` — the **only** live template tied to
  the React app.
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

**Client-vs-server position gotcha:** budget picks from the server carry the player's
real `position`, but the client `budget_player` event / `updateBudgetedPlayers` must be
given `position` explicitly — otherwise a slot budgeted during the session has an empty
`position` until the next React Query refetch, breaking eligibility checks. Always pass
`position` when dispatching `budget_player`.

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

**Key data shapes** (loose `any` in the code):
- Budget slot: `{ order, allowed_positions: string[], pick: { player_id, player_name, position, projected_price, actual_price, price, budget_position, status, ... } }`, keyed by slot name. Empty pick ⇒ `player_id === ""`.
- Manager: `{ manager_id, manager_name, manager_position, manager_budget, is_drafter, draft_picks: { [slot]: { allowed_positions, position_slot, pick: {...} } } }`.

**Relevant endpoints** (wrapped in `lib/data.ts`): `submit_pick` / `unsubmit_pick`,
`budget_pick` / `unbudget_pick`, `reslot_picks` / `reslot_budget`, `watch`,
`available_players`, `manager_picks`, `budgeted_picks`, `watched_picks`.

**BudgetConflictModal** (`features/BudgetConflictModal.tsx`): raised from
`DraftBoard.handleDrop` when the drafter drafts into a budget slot already holding a
*different* player. Lets the owner keep the displaced player (move to an eligible open
slot) and drop other budgeted players to fit the remaining budget. Confirm is advisory
(always enabled). The resolution is applied in one pass via the state machine's
`apply_budget_resolution` event.

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

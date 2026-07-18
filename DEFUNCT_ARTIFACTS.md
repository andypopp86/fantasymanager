# Defunct / Suspected-Dead Artifacts

Running list of code that appears superseded or unused, found while working in the repo.
Each entry: what it is, why it looks defunct, and confidence. **Nothing here is deleted yet** —
verify before removing.

| Artifact | Why suspected defunct | Confidence |
| --- | --- | --- |
| `static/js/draftboard.js` (jQuery draft board, ~1035 lines) | Live draft is the React app: `react_draft_entrypoint` → `draft/index.html` → Vite bundle `frontend/draftboard/src/main.jsx`. No Python `render()`/`include` references `draftboard.html`. This is the pre-React board. | **High** |
| `templates/draft/draftboard.html` + partials it includes (`draft_modal_*.html`, `draft_manager_budgets.html`, `priceboard.html`, `draft_board_picks.html`, etc.) | Not rendered or `{% include %}`d anywhere. Only consumer was the jQuery board. | **High** (verify each partial isn't reused by a still-live template before deleting) |
| `static/css/draftboard.css` | Styles the jQuery board only. | **High** |

> Note: some `templates/draft/*.html` (e.g. `player_running_totals.html`, `historical_picks.html`)
> ARE still rendered by live views in `draft/views.py` — do not lump those in. Confirm per-file.

<!-- Append new findings below as they turn up. -->

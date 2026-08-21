"""The /admin "refresh ADP, then sync a draft" pipeline.

One staff click does four things and reports each in the browser:

  1. re-pull ADP from the FFC feed, upserting players
  2. recompute projected prices from that ADP  (same import — step 2 is not
                                                separable from step 1)
  3. list the players the refresh CREATED
  4. backfill one draft's available-player pool, and list what it added

Why 3 and 4 both get listed: a draft's pool is its own DraftPick rows, fixed
when the draft was created, so a player new to the feed exists in the DB but
cannot be nominated until step 4 runs. A refresh typically creates a handful of
players, so printing both lists is enough to eyeball that they agree — no
programmatic cross-check, which would be more machinery than the check is worth.

Lives here, not in admin.py, so the pipeline is testable without a request and
the action stays thin. The FFC import itself is NOT reimplemented — it comes
from add_players.refresh_players_from_ffc, the same call the management commands
make.
"""

import dataclasses
import logging

from draft.management.commands.add_players import ImportSummary, refresh_players_from_ffc

logger = logging.getLogger(__name__)


@dataclasses.dataclass
class RefreshReport:
    """Everything the admin results page renders."""

    draft_name: str
    draft_year: int
    summary: ImportSummary
    picks_added: list = dataclasses.field(default_factory=list)
    # logging records captured during the run (WARNING+), so a quiet failure in
    # the import — "no HistoricalDraftPicks", a team it couldn't link — reaches
    # the browser instead of only the container's stdout.
    warnings: list = dataclasses.field(default_factory=list)

    @property
    def year_mismatch(self):
        """The refresh only touches the CURRENT year. Syncing a draft from
        another season is legal but can't gain anything from this run, and
        saying so beats showing an empty step 4 as if it were normal."""
        return self.draft_year != self.summary.year


class _WarningCollector(logging.Handler):
    """Buffers WARNING+ records emitted anywhere under the `draft` logger.

    INFO is deliberately not collected: the import logs a line per player, so
    ~1,200 of them would bury the handful of players the page exists to show.
    The narrative comes from the structured report; this only catches trouble.
    """

    def __init__(self):
        super().__init__(level=logging.WARNING)
        self.records = []

    def emit(self, record):
        self.records.append(self.format(record))


def refresh_and_sync(draft):
    """Run the pipeline for one draft and return a RefreshReport.

    Writes on every step (players upserted, prices rewritten, pick rows
    created), so callers must confirm with the user first — see the admin
    action. Every step is individually idempotent, which is what makes a retry
    after a timeout safe.
    """
    collector = _WarningCollector()
    collector.setFormatter(logging.Formatter('%(levelname)s %(name)s: %(message)s'))
    draft_logger = logging.getLogger('draft')
    draft_logger.addHandler(collector)
    try:
        summary = refresh_players_from_ffc()       # steps 1 + 2
        picks_added = draft.add_missing_players()   # step 4
    finally:
        draft_logger.removeHandler(collector)

    return RefreshReport(
        draft_name=draft.draft_name,
        draft_year=draft.year,
        summary=summary,
        picks_added=picks_added,
        warnings=collector.records,
    )

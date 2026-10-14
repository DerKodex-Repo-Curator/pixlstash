"""Task that moves settled downloads from the Downloads folder onto the shelf.

Handed out by :class:`~pixlstash.tasks.downloads_intake_finder.DownloadsIntakeFinder`;
the move itself is :func:`pixlstash.services.downloads_intake.take_in`.
"""

from __future__ import annotations

from typing import Any, Callable, Optional

from pixlstash.event_types import EventType
from pixlstash.hub.db import HubDatabase
from pixlstash.pixl_logging import get_logger
from pixlstash.services.downloads_intake import OUTCOME_BUSY, OUTCOME_MOVED, take_in
from pixlstash.tasks.base_task import BaseTask

logger = get_logger(__name__)


class DownloadsIntakeTask(BaseTask):
    """Move a batch of downloaded model files into the default folder."""

    def __init__(
        self,
        hub: HubDatabase,
        paths: list[str],
        notifier: Optional[Callable[[EventType, Any], None]] = None,
    ):
        """Bind the task to the files the finder judged settled.

        Args:
            hub: The hub database holding the shelf tables.
            paths: Files at the top of the Downloads folder.
            notifier: ``Vault.notify``, to announce the models that arrived.
        """
        super().__init__(task_type="DownloadsIntakeTask", params={"paths": paths})
        self._hub = hub
        self._paths = paths
        self._notifier = notifier
        # The files another shelf write kept us from, read by the finder's
        # ``on_task_complete`` so they are tried again rather than left.
        self.busy_paths: list[str] = []
        self._total_count = len(paths)
        self._processed_count = 0

    def _run_task(self) -> dict[str, Any]:
        moved: list[int] = []
        for path in self._paths:
            outcome, model_id = take_in(self._hub, path)
            if outcome == OUTCOME_MOVED:
                moved.append(model_id)
            elif outcome == OUTCOME_BUSY:
                self.busy_paths.append(path)
            self._processed_count += 1
        if moved:
            logger.info(
                "Moved %d downloaded model(s) onto the shelf: model ids %s.",
                len(moved),
                moved,
            )
            if self._notifier is not None:
                self._notifier(EventType.MODELS_ARRIVED, {"model_ids": moved})
        return {"moved": moved, "busy": list(self.busy_paths)}

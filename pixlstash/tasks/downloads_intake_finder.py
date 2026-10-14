"""Finder for model files that have finished downloading into the Downloads folder."""

from __future__ import annotations

import os
import threading
import time
from typing import Any, Callable, Optional

from pixlstash.event_types import EventType
from pixlstash.hub.db import HubDatabase
from pixlstash.services.downloads_intake import (
    candidates,
    find_downloads_folder,
    safetensors_complete,
)
from pixlstash.tasks.base_task_finder import BaseTaskFinder
from pixlstash.tasks.downloads_intake_task import DownloadsIntakeTask

# How often the folder is listed. One ``scandir`` of one directory, so the cost
# is nothing; the interval only bounds how soon a finished download is noticed.
_CHECK_INTERVAL_S = 2.0


class DownloadsIntakeFinder(BaseTaskFinder):
    """Hand out the settled model files at the top of the Downloads folder.

    A file qualifies once its ``(size, mtime)`` has stayed the same for
    ``SETTLE_SECONDS`` and, for a ``.safetensors``, once it is as long as its
    header says (:func:`~pixlstash.services.downloads_intake.safetensors_complete`).
    The same wall-clock settle the picture watch folders use
    (``MissingWatchFolderImportFinder``), and longer, because a download that
    pauses is common and a model moved half-written is a model that cannot load.

    A file handed out is remembered with the signature it had. One that stays in
    Downloads because of the file itself - its name is taken in the default
    folder, or it does not read as a model - is therefore not retried every
    sweep, only once it changes. One that stayed for a reason that may pass (a
    busy shelf, a default folder that is missing or unplugged, a failed copy)
    is forgotten when the task ends (:meth:`on_task_complete`), so it settles
    again and is retried, about every ``SETTLE_SECONDS``, until it goes.

    Registered in ``vault.py`` with the hub finders, because the shelf is a hub
    fact; only one vault is live at a time.
    """

    SETTLE_SECONDS = 15.0

    def __init__(
        self,
        hub: HubDatabase,
        notifier: Optional[Callable[[EventType, Any], None]] = None,
    ) -> None:
        """Initialise the finder.

        Args:
            hub: The hub database holding ``model_folder``.
            notifier: ``Vault.notify``, passed on to the task.
        """
        super().__init__()
        self._hub = hub
        self._notifier = notifier
        # path -> (signature, monotonic time the signature was first seen).
        self._pending: dict[str, tuple[tuple[int, int], float]] = {}
        # path -> the signature it had when it was handed out.
        self._dispatched: dict[str, tuple[int, int]] = {}
        # ``on_task_complete`` may run on the task runner's thread.
        self._lock = threading.Lock()

    def finder_name(self) -> str:
        return "DownloadsIntakeFinder"

    def find_task(self):
        if not self._due(_CHECK_INTERVAL_S):
            return None
        folder = find_downloads_folder(self._hub)
        if folder is None:
            with self._lock:
                self._pending.clear()
                self._dispatched.clear()
            return None
        now = time.monotonic()
        ready: list[str] = []
        seen: set[str] = set()
        for path in candidates(folder["path"]):
            try:
                stat = os.stat(path)
            except OSError:
                continue
            signature = (stat.st_size, stat.st_mtime_ns)
            seen.add(path)
            if not self._settled(path, signature, now):
                continue
            if not safetensors_complete(path):
                continue
            with self._lock:
                self._pending.pop(path, None)
                self._dispatched[path] = signature
            ready.append(path)
        with self._lock:
            for table in (self._pending, self._dispatched):
                for path in [p for p in table if p not in seen]:
                    del table[path]
        if not ready:
            return None
        return DownloadsIntakeTask(self._hub, ready, notifier=self._notifier)

    def on_task_complete(self, task, error) -> None:
        """Forget what the task did not get to, so it is offered again."""
        retry = (task.params or {}).get("paths", []) if error else task.retry_paths
        with self._lock:
            for path in retry:
                self._dispatched.pop(path, None)

    def _settled(self, path: str, signature: tuple[int, int], now: float) -> bool:
        with self._lock:
            if path in self._dispatched:
                if self._dispatched[path] == signature:
                    return False
                # Changed since it was handed out: it settles again.
                del self._dispatched[path]
            first = self._pending.get(path)
            if first is None or first[0] != signature:
                self._pending[path] = (signature, now)
                return False
            return now - first[1] >= self.SETTLE_SECONDS

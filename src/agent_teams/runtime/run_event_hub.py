from __future__ import annotations

from queue import Queue
from threading import Lock

from agent_teams.core.models import RunEvent


class RunEventHub:
    def __init__(self) -> None:
        self._lock = Lock()
        self._subscribers: dict[str, list[Queue[RunEvent]]] = {}

    def subscribe(self, run_id: str) -> Queue[RunEvent]:
        queue: Queue[RunEvent] = Queue()
        with self._lock:
            self._subscribers.setdefault(run_id, []).append(queue)
        return queue

    def publish(self, event: RunEvent) -> None:
        with self._lock:
            listeners = tuple(self._subscribers.get(event.run_id, ()))
        for queue in listeners:
            queue.put(event)

    def unsubscribe_all(self, run_id: str) -> None:
        with self._lock:
            self._subscribers.pop(run_id, None)

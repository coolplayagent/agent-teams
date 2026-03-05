from __future__ import annotations

import asyncio

from agent_teams.runs.models import RunEvent
from agent_teams.state.event_log import EventLog


class RunEventHub:
    def __init__(self, event_log: EventLog | None = None) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[RunEvent]]] = {}
        self._event_log = event_log

    def subscribe(self, run_id: str) -> asyncio.Queue[RunEvent]:
        queue: asyncio.Queue[RunEvent] = asyncio.Queue()
        self._subscribers.setdefault(run_id, []).append(queue)
        return queue

    def publish(self, event: RunEvent) -> None:
        if self._event_log:
            self._event_log.emit_run_event(event)

        listeners = self._subscribers.get(event.run_id, [])
        for queue in listeners:
            queue.put_nowait(event)

    def unsubscribe_all(self, run_id: str) -> None:
        self._subscribers.pop(run_id, None)

# -*- coding: utf-8 -*-
from __future__ import annotations

import signal
from types import FrameType

import pytest

from agent_teams.interfaces.server import app as server_app


def test_register_signal_handlers_logs_and_chains_previous_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assigned_handlers: dict[int, server_app.SignalHandler] = {}
    previous_called_with: list[int] = []
    logged_signals: list[str] = []

    def previous_handler(sig: int, _frame: FrameType | None) -> None:
        previous_called_with.append(sig)

    def fake_getsignal(_sig: int) -> server_app.SignalHandler:
        return previous_handler

    def fake_signal(sig: int, handler: server_app.SignalHandler) -> server_app.SignalHandler:
        assigned_handlers[sig] = handler
        return previous_handler

    def fake_log_event(*_args: object, **kwargs: object) -> None:
        payload = kwargs.get("payload")
        if isinstance(payload, dict):
            signal_name = payload.get("signal")
            if isinstance(signal_name, str):
                logged_signals.append(signal_name)

    monkeypatch.setattr(server_app.signal, "getsignal", fake_getsignal)
    monkeypatch.setattr(server_app.signal, "signal", fake_signal)
    monkeypatch.setattr(server_app, "log_event", fake_log_event)

    server_app._register_signal_handlers()

    assigned_handlers[signal.SIGINT](signal.SIGINT, None)

    assert previous_called_with == [signal.SIGINT]
    assert logged_signals == ["SIGINT"]


def test_register_signal_handlers_raises_keyboard_interrupt_on_default_sigint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assigned_handlers: dict[int, server_app.SignalHandler] = {}

    def fake_getsignal(_sig: int) -> int:
        return signal.SIG_DFL

    def fake_signal(sig: int, handler: server_app.SignalHandler) -> int:
        assigned_handlers[sig] = handler
        return signal.SIG_DFL

    def fake_log_event(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(server_app.signal, "getsignal", fake_getsignal)
    monkeypatch.setattr(server_app.signal, "signal", fake_signal)
    monkeypatch.setattr(server_app, "log_event", fake_log_event)

    server_app._register_signal_handlers()

    with pytest.raises(KeyboardInterrupt):
        assigned_handlers[signal.SIGINT](signal.SIGINT, None)

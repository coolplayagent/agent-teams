# -*- coding: utf-8 -*-
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from relay_teams.interfaces.server.deps import (
    get_agent_runtime_test_job_service,
    get_general_config_service,
    get_llm_evaluator,
)


def test_get_llm_evaluator_returns_evaluator() -> None:
    fake_container = MagicMock()
    fake_container.resolve_auxiliary_model_config.return_value = MagicMock(
        model="configured-model"
    )
    fake_container.resolve_auxiliary_model_profile_name.return_value = (
        "evaluation-profile"
    )
    fake_provider = MagicMock()
    fake_container.create_provider.return_value = fake_provider
    fake_request = MagicMock()

    with patch(
        "relay_teams.interfaces.server.deps.get_container",
        return_value=fake_container,
    ):
        result = get_llm_evaluator(fake_request)
        assert result is not None
        fake_container.resolve_auxiliary_model_config.assert_called_once()
        fake_container.create_provider.assert_called_once()
        role = fake_container.create_provider.call_args.args[0]
        assert role.model_profile == "evaluation-profile"


def test_get_llm_evaluator_rejects_missing_auxiliary_model_config() -> None:
    fake_container = MagicMock()
    fake_container.resolve_auxiliary_model_config.return_value = None
    fake_container.resolve_auxiliary_model_profile_name.return_value = None
    fake_provider = MagicMock()
    fake_container.create_provider.return_value = fake_provider
    fake_request = MagicMock()

    with patch(
        "relay_teams.interfaces.server.deps.get_container",
        return_value=fake_container,
    ):
        with pytest.raises(
            RuntimeError,
            match="No model profile is configured for auxiliary LLM evaluation",
        ):
            get_llm_evaluator(fake_request)

    fake_container.create_provider.assert_not_called()


def test_get_llm_evaluator_rejects_missing_auxiliary_profile_name() -> None:
    fake_container = MagicMock()
    fake_container.resolve_auxiliary_model_config.return_value = MagicMock(
        model="configured-model"
    )
    fake_container.resolve_auxiliary_model_profile_name.return_value = None
    fake_request = MagicMock()

    with patch(
        "relay_teams.interfaces.server.deps.get_container",
        return_value=fake_container,
    ):
        with pytest.raises(
            RuntimeError,
            match="No model profile is configured for auxiliary LLM evaluation",
        ):
            get_llm_evaluator(fake_request)

    fake_container.create_provider.assert_not_called()


def test_get_general_config_service_returns_container_service() -> None:
    fake_container = MagicMock()
    fake_request = MagicMock()

    with patch(
        "relay_teams.interfaces.server.deps.get_container",
        return_value=fake_container,
    ):
        result = get_general_config_service(fake_request)

    assert result is fake_container.general_config_service


def test_get_agent_runtime_test_job_service_returns_container_service() -> None:
    fake_container = MagicMock()
    fake_request = MagicMock()

    with patch(
        "relay_teams.interfaces.server.deps.get_container",
        return_value=fake_container,
    ):
        result = get_agent_runtime_test_job_service(fake_request)

    assert result is fake_container.agent_runtime_test_job_service

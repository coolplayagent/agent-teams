# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
from json import loads
from pathlib import Path
from typing import cast

import pytest
from pydantic import JsonValue

from relay_teams.providers.codeagent_auth import codeagent_password_secret_field_name
from relay_teams.providers.maas_auth import maas_password_secret_field_name
from relay_teams.secrets import AppSecretStore, SecretIndexDocument, SecretIndexEntry
from relay_teams.secrets.secret_models import SecretCoordinate


_MODEL_PROFILE_SECRET_NAMESPACE = "model_profile"


class _FileOnlySecretStore(AppSecretStore):
    def has_usable_keyring_backend(self) -> bool:
        return False


def _secret_entries(config_dir: Path) -> list[dict[str, JsonValue]]:
    payload = cast(
        dict[str, JsonValue],
        loads((config_dir / "secrets.json").read_text(encoding="utf-8")),
    )
    entries = payload["entries"]
    assert isinstance(entries, list)
    return cast(list[dict[str, JsonValue]], entries)


class _FlakyKeyringSecretStore(AppSecretStore):
    def has_usable_keyring_backend(self) -> bool:
        return True

    def _set_in_keyring(
        self,
        config_dir: Path,
        coordinate: SecretCoordinate,
        value: str,
    ) -> None:
        _ = (config_dir, coordinate, value)
        raise RuntimeError("simulated keyring failure")


class _UnreadableKeyringSecretStore(AppSecretStore):
    def __init__(self) -> None:
        self.deleted_coordinates: list[SecretCoordinate] = []

    def has_usable_keyring_backend(self) -> bool:
        return True

    def _get_from_keyring(
        self,
        config_dir: Path,
        coordinate: SecretCoordinate,
    ) -> str | None:
        _ = (config_dir, coordinate)
        return None

    def _delete_from_keyring(
        self,
        config_dir: Path,
        coordinate: SecretCoordinate,
    ) -> None:
        _ = config_dir
        self.deleted_coordinates.append(coordinate)


class _MemoryKeyringSecretStore(AppSecretStore):
    def __init__(self) -> None:
        self.values: dict[tuple[str, str, str], str] = {}

    def has_usable_keyring_backend(self) -> bool:
        return True

    def _get_from_keyring(
        self,
        config_dir: Path,
        coordinate: SecretCoordinate,
    ) -> str | None:
        _ = config_dir
        return self.values.get(_coordinate_key(coordinate))

    def _set_in_keyring(
        self,
        config_dir: Path,
        coordinate: SecretCoordinate,
        value: str,
    ) -> None:
        _ = config_dir
        self.values[_coordinate_key(coordinate)] = value


def _coordinate_key(coordinate: SecretCoordinate) -> tuple[str, str, str]:
    return (coordinate.namespace, coordinate.owner_id, coordinate.field_name)


def test_set_secret_falls_back_to_shared_secrets_file(tmp_path: Path) -> None:
    store = _FileOnlySecretStore()

    store.set_secret(
        tmp_path,
        namespace="proxy_config",
        owner_id="default",
        field_name="password",
        value="secret",
    )

    assert (
        store.get_secret(
            tmp_path,
            namespace="proxy_config",
            owner_id="default",
            field_name="password",
        )
        == "secret"
    )
    payload = loads((tmp_path / "secrets.json").read_text(encoding="utf-8"))
    assert payload["entries"] == [
        {
            "namespace": "proxy_config",
            "owner_id": "default",
            "field_name": "password",
            "storage": "file",
            "value": "secret",
        }
    ]


@pytest.mark.parametrize(
    "field_name",
    (maas_password_secret_field_name(), codeagent_password_secret_field_name()),
)
def test_model_password_file_fallback_is_encrypted(
    tmp_path: Path,
    field_name: str,
) -> None:
    store = _FileOnlySecretStore()

    store.set_secret(
        tmp_path,
        namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
        owner_id="default",
        field_name=field_name,
        value="relay-password",
    )

    assert (
        store.get_secret(
            tmp_path,
            namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
            owner_id="default",
            field_name=field_name,
        )
        == "relay-password"
    )
    entries = _secret_entries(tmp_path)
    assert len(entries) == 1
    value = entries[0]["value"]
    assert isinstance(value, str)
    assert value.startswith("ENC:")
    assert value != "relay-password"
    assert "relay-password" not in value


def test_non_target_model_profile_file_secret_remains_plaintext(
    tmp_path: Path,
) -> None:
    store = _FileOnlySecretStore()

    store.set_secret(
        tmp_path,
        namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
        owner_id="default",
        field_name="api_key",
        value="secret-key",
    )

    assert _secret_entries(tmp_path)[0]["value"] == "secret-key"


def test_model_password_uses_keyring_without_file_value(tmp_path: Path) -> None:
    store = _MemoryKeyringSecretStore()

    store.set_secret(
        tmp_path,
        namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
        owner_id="default",
        field_name=maas_password_secret_field_name(),
        value="relay-password",
    )

    assert (
        store.get_secret(
            tmp_path,
            namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
            owner_id="default",
            field_name=maas_password_secret_field_name(),
        )
        == "relay-password"
    )
    assert (
        store.values[
            (
                _MODEL_PROFILE_SECRET_NAMESPACE,
                "default",
                maas_password_secret_field_name(),
            )
        ]
        == "relay-password"
    )
    assert _secret_entries(tmp_path) == [
        {
            "namespace": _MODEL_PROFILE_SECRET_NAMESPACE,
            "owner_id": "default",
            "field_name": maas_password_secret_field_name(),
            "storage": "keyring",
            "value": None,
        }
    ]


def test_model_password_keyring_failure_file_fallback_is_encrypted(
    tmp_path: Path,
) -> None:
    store = _FlakyKeyringSecretStore()

    store.set_secret(
        tmp_path,
        namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
        owner_id="default",
        field_name=maas_password_secret_field_name(),
        value="relay-password",
    )

    assert (
        store.get_secret(
            tmp_path,
            namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
            owner_id="default",
            field_name=maas_password_secret_field_name(),
        )
        == "relay-password"
    )
    value = _secret_entries(tmp_path)[0]["value"]
    assert isinstance(value, str)
    assert value.startswith("ENC:")
    assert "relay-password" not in value


def test_legacy_plaintext_model_password_file_secret_is_readable(
    tmp_path: Path,
) -> None:
    store = _FileOnlySecretStore()
    store._save_index(
        tmp_path,
        SecretIndexDocument(
            entries=(
                SecretIndexEntry(
                    namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
                    owner_id="legacy",
                    field_name=maas_password_secret_field_name(),
                    storage="file",
                    value="legacy-password",
                ),
            )
        ),
    )

    assert (
        store.get_secret(
            tmp_path,
            namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
            owner_id="legacy",
            field_name=maas_password_secret_field_name(),
        )
        == "legacy-password"
    )


def test_corrupt_encrypted_model_password_returns_none_and_logs(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    store = _FileOnlySecretStore()
    store._save_index(
        tmp_path,
        SecretIndexDocument(
            entries=(
                SecretIndexEntry(
                    namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
                    owner_id="broken",
                    field_name=codeagent_password_secret_field_name(),
                    storage="file",
                    value="ENC:not-valid",
                ),
            )
        ),
    )

    with caplog.at_level(logging.WARNING):
        value = store.get_secret(
            tmp_path,
            namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
            owner_id="broken",
            field_name=codeagent_password_secret_field_name(),
        )

    assert value is None
    assert "Failed to decrypt file-backed secret" in caplog.text
    assert "not-valid" not in caplog.text


def test_set_secret_falls_back_to_file_when_keyring_write_fails(tmp_path: Path) -> None:
    store = _FlakyKeyringSecretStore()

    store.set_secret(
        tmp_path,
        namespace="proxy_config",
        owner_id="default",
        field_name="password",
        value="secret",
    )

    assert (
        store.get_secret(
            tmp_path,
            namespace="proxy_config",
            owner_id="default",
            field_name="password",
        )
        == "secret"
    )
    payload = loads((tmp_path / "secrets.json").read_text(encoding="utf-8"))
    assert payload["entries"] == [
        {
            "namespace": "proxy_config",
            "owner_id": "default",
            "field_name": "password",
            "storage": "file",
            "value": "secret",
        }
    ]


def test_rename_owner_moves_file_backed_secrets(tmp_path: Path) -> None:
    store = _FileOnlySecretStore()
    store.set_secret(
        tmp_path,
        namespace="model_profile",
        owner_id="default",
        field_name="api_key",
        value="secret-key",
    )

    store.rename_owner(
        tmp_path,
        namespace="model_profile",
        from_owner_id="default",
        to_owner_id="renamed",
    )

    assert (
        store.get_secret(
            tmp_path,
            namespace="model_profile",
            owner_id="default",
            field_name="api_key",
        )
        is None
    )
    assert (
        store.get_secret(
            tmp_path,
            namespace="model_profile",
            owner_id="renamed",
            field_name="api_key",
        )
        == "secret-key"
    )


def test_rename_owner_moves_encrypted_model_password_file_secret(
    tmp_path: Path,
) -> None:
    store = _FileOnlySecretStore()
    store.set_secret(
        tmp_path,
        namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
        owner_id="default",
        field_name=maas_password_secret_field_name(),
        value="relay-password",
    )

    store.rename_owner(
        tmp_path,
        namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
        from_owner_id="default",
        to_owner_id="renamed",
    )

    assert (
        store.get_secret(
            tmp_path,
            namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
            owner_id="default",
            field_name=maas_password_secret_field_name(),
        )
        is None
    )
    assert (
        store.get_secret(
            tmp_path,
            namespace=_MODEL_PROFILE_SECRET_NAMESPACE,
            owner_id="renamed",
            field_name=maas_password_secret_field_name(),
        )
        == "relay-password"
    )
    value = _secret_entries(tmp_path)[0]["value"]
    assert isinstance(value, str)
    assert value.startswith("ENC:")
    assert "relay-password" not in value


def test_rename_owner_preserves_unreadable_keyring_entry(tmp_path: Path) -> None:
    store = _UnreadableKeyringSecretStore()
    store._save_index(
        tmp_path,
        SecretIndexDocument(
            entries=(
                SecretIndexEntry(
                    namespace="model_profile",
                    owner_id="default",
                    field_name="api_key",
                    storage="keyring",
                ),
            )
        ),
    )

    store.rename_owner(
        tmp_path,
        namespace="model_profile",
        from_owner_id="default",
        to_owner_id="renamed",
    )

    payload = loads((tmp_path / "secrets.json").read_text(encoding="utf-8"))
    assert payload["entries"] == [
        {
            "namespace": "model_profile",
            "owner_id": "default",
            "field_name": "api_key",
            "storage": "keyring",
            "value": None,
        }
    ]
    assert store.deleted_coordinates == []


class _UnavailableKeyringBackend:
    @property
    def priority(self) -> float:
        raise RuntimeError("backend unavailable")


class _RuntimeErrorKeyringSecretStore(AppSecretStore):
    def _get_keyring_backend(self) -> object | None:
        return _UnavailableKeyringBackend()


def test_has_usable_keyring_backend_ignores_backend_runtime_errors() -> None:
    store = _RuntimeErrorKeyringSecretStore()

    assert store.has_usable_keyring_backend() is False


def test_list_owner_fields_does_not_resolve_config_dir(
    tmp_path: Path,
    monkeypatch,
) -> None:
    store = _FileOnlySecretStore()
    store.set_secret(
        tmp_path,
        namespace="github_config",
        owner_id="default",
        field_name="token",
        value="secret",
    )

    def _raise_resolve(_self: Path, strict: bool = False) -> Path:
        _ = strict
        raise AssertionError("list_owner_fields should not resolve the config dir")

    monkeypatch.setattr(Path, "resolve", _raise_resolve)

    assert store.list_owner_fields(
        tmp_path,
        namespace="github_config",
        owner_id="default",
    ) == ("token",)


def test_delete_owner_removes_all_secret_fields(tmp_path: Path) -> None:
    store = _FileOnlySecretStore()
    store.set_secret(
        tmp_path,
        namespace="feishu_trigger",
        owner_id="trigger-a",
        field_name="app_secret",
        value="app-secret",
    )
    store.set_secret(
        tmp_path,
        namespace="feishu_trigger",
        owner_id="trigger-a",
        field_name="verification_token",
        value="verification-token",
    )

    store.delete_owner(
        tmp_path,
        namespace="feishu_trigger",
        owner_id="trigger-a",
    )

    assert (
        store.get_owner_secrets(
            tmp_path,
            namespace="feishu_trigger",
            owner_id="trigger-a",
        )
        == {}
    )

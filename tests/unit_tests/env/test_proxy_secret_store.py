# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

import pytest

import relay_teams.env.proxy_secret_store as proxy_secret_store_module
from relay_teams.secrets import AppSecretStore


class _LegacyKeyring:
    def __init__(self) -> None:
        self.deleted = False

    def get_password(self, _service_name: str, _account_name: str) -> str | None:
        return " legacy-proxy-password "

    def delete_password(self, _service_name: str, _account_name: str) -> None:
        self.deleted = True


class _FailingLegacyMigrationSecretStore(AppSecretStore):
    def get_secret(
        self,
        config_dir: Path,
        *,
        namespace: str,
        owner_id: str,
        field_name: str,
    ) -> str | None:
        _ = (config_dir, namespace, owner_id, field_name)
        return None

    def migrate_legacy_secret(
        self,
        config_dir: Path,
        *,
        namespace: str,
        owner_id: str,
        field_name: str,
        value: str | None,
    ) -> bool:
        _ = (config_dir, namespace, owner_id, field_name, value)
        raise RuntimeError("failed to encrypt file-backed proxy password")


@pytest.mark.parametrize("failure", (RuntimeError, OSError))
def test_legacy_proxy_password_read_survives_migration_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure: type[Exception],
) -> None:
    class FailingSecretStore(_FailingLegacyMigrationSecretStore):
        def migrate_legacy_secret(
            self,
            config_dir: Path,
            *,
            namespace: str,
            owner_id: str,
            field_name: str,
            value: str | None,
        ) -> bool:
            _ = (config_dir, namespace, owner_id, field_name, value)
            raise failure("migration failed")

    keyring = _LegacyKeyring()
    monkeypatch.setattr(proxy_secret_store_module, "keyring", keyring)
    store = proxy_secret_store_module.ProxySecretStore(
        secret_store=FailingSecretStore()
    )

    assert store.get_password(tmp_path) == "legacy-proxy-password"
    assert keyring.deleted is False

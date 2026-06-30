# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path
import subprocess

from cryptography.fernet import Fernet
import pytest

from relay_teams.secrets import encryption_service as encryption_module
from relay_teams.secrets.encryption_service import (
    EncryptionService,
    MachineFeatureError,
    SecretDecryptionError,
)


def test_encrypt_decrypt_round_trip_uses_prefix_and_cached_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()
    feature_calls: list[bool] = []

    def collect_features() -> str:
        feature_calls.append(True)
        return "machine-123|host|Linux-6"

    monkeypatch.setattr(service, "collect_machine_features", collect_features)

    ciphertext = service.encrypt("relay-password")

    assert ciphertext.startswith("ENC:")
    assert ciphertext != "relay-password"
    assert service.is_encrypted(ciphertext)
    assert service.decrypt(ciphertext) == "relay-password"
    assert service.needs_migration is False
    assert feature_calls == [True]


def test_decrypt_rejects_plaintext_and_invalid_ciphertext(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()
    monkeypatch.setattr(
        service,
        "collect_machine_features",
        lambda: "machine-123|host|Linux-6",
    )
    monkeypatch.setattr(service, "_get_legacy_machine_features", tuple)

    with pytest.raises(SecretDecryptionError, match="not encrypted"):
        service.decrypt("relay-password")

    with pytest.raises(SecretDecryptionError, match="Failed to decrypt"):
        service.decrypt("ENC:v1:not-valid")

    assert service.is_encrypted("ENC:not-valid") is False


def test_decrypt_legacy_machine_features_marks_migration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()
    legacy_features = "legacy-mac|host|Linux-6"
    legacy_token = Fernet(service.derive_key_from_features(legacy_features)).encrypt(
        b"legacy-password"
    )
    monkeypatch.setattr(
        service,
        "collect_machine_features",
        lambda: "current-machine|host|Linux-6",
    )
    monkeypatch.setattr(
        service,
        "_get_legacy_machine_features",
        lambda: ("", legacy_features),
    )

    assert (
        service.decrypt(f"ENC:v1:{legacy_token.decode('utf-8')}") == "legacy-password"
    )
    assert service.needs_migration is True


def test_derive_key_and_collect_machine_features_validate_inputs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()

    with pytest.raises(MachineFeatureError, match="unavailable"):
        service.derive_key_from_features("")

    monkeypatch.setattr(service, "_get_machine_id", lambda: "machine-123")
    monkeypatch.setattr(encryption_module.socket, "gethostname", lambda: "host-a")
    monkeypatch.setattr(encryption_module.platform, "system", lambda: "Linux")
    monkeypatch.setattr(encryption_module.platform, "release", lambda: "6.1")

    assert service.collect_machine_features() == "machine-123"

    monkeypatch.setattr(service, "_get_machine_id", lambda: "00000000")
    monkeypatch.setattr(encryption_module.socket, "gethostname", str)
    monkeypatch.setattr(encryption_module.platform, "system", str)
    monkeypatch.setattr(encryption_module.platform, "release", str)
    with pytest.raises(MachineFeatureError, match="unavailable"):
        service.collect_machine_features()


def test_get_machine_id_uses_platform_id_then_mac_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()

    monkeypatch.setattr(encryption_module.platform, "system", lambda: "Windows")
    monkeypatch.setattr(service, "_get_windows_id", lambda: "win-uuid-123")
    assert service._get_machine_id() == "win-uuid-123"

    monkeypatch.setattr(encryption_module.platform, "system", lambda: "Linux")
    monkeypatch.setattr(service, "_get_linux_id", lambda: "unknown")
    monkeypatch.setattr(service, "_get_mac_fallback", lambda: "001122334455")
    assert service._get_machine_id() == "001122334455"

    monkeypatch.setattr(encryption_module.platform, "system", lambda: "Plan9")
    monkeypatch.setattr(service, "_get_mac_fallback", lambda: None)
    with pytest.raises(MachineFeatureError, match="No stable"):
        service._get_machine_id()


def test_platform_machine_id_collectors_parse_valid_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()

    commands: list[tuple[str, ...]] = []

    def fake_command(command: tuple[str, ...]) -> subprocess.CompletedProcess[str]:
        commands.append(command)
        stdout = (
            "UUID\nnot-set\n" if len(commands) == 1 else "SerialNumber\nSERIAL1234\n"
        )
        return subprocess.CompletedProcess(list(command), 0, stdout=stdout)

    monkeypatch.setattr(service, "_run_text_command", fake_command)
    assert service._get_windows_id() == "SERIAL1234"

    monkeypatch.setattr(
        service,
        "_run_text_command",
        lambda command: subprocess.CompletedProcess(
            list(command),
            0,
            stdout='    IOPlatformUUID = "ABCDEF12-3456-7890"\n',
        ),
    )
    assert service._get_macos_id() == "ABCDEF12-3456-7890"


def test_linux_id_reads_first_valid_machine_file(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()
    seen_paths: list[str] = []

    def fake_read_text(path: Path, *, encoding: str | None = None) -> str:
        seen_paths.append(path.as_posix())
        _ = encoding
        if path.as_posix() == "/etc/machine-id":
            raise OSError("missing")
        return "linux-machine-123"

    monkeypatch.setattr(Path, "read_text", fake_read_text)

    assert service._get_linux_id() == "linux-machine-123"
    assert seen_paths[:2] == ["/etc/machine-id", "/sys/class/dmi/id/product_uuid"]


def test_mac_fallback_dispatches_by_platform(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()
    monkeypatch.setattr(service, "_get_linux_mac_address", lambda: "linux")
    monkeypatch.setattr(service, "_get_windows_mac_address", lambda: "windows")
    monkeypatch.setattr(service, "_get_macos_mac_address", lambda: "macos")
    monkeypatch.setattr(service, "_get_uuid_mac_address", lambda: "uuid")

    monkeypatch.setattr(encryption_module.platform, "system", lambda: "Linux")
    assert service._get_mac_fallback() == "linux"
    monkeypatch.setattr(encryption_module.platform, "system", lambda: "Windows")
    assert service._get_mac_fallback() == "windows"
    monkeypatch.setattr(encryption_module.platform, "system", lambda: "Darwin")
    assert service._get_mac_fallback() == "macos"
    monkeypatch.setattr(encryption_module.platform, "system", lambda: "FreeBSD")
    assert service._get_mac_fallback() == "uuid"


def test_linux_mac_address_skips_ignored_interfaces(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    service = EncryptionService()
    network_dir = tmp_path / "net"
    loopback = network_dir / "lo"
    ethernet = network_dir / "eth0"
    loopback.mkdir(parents=True)
    ethernet.mkdir()
    (ethernet / "address").write_text("00:11:22:33:44:55\n", encoding="utf-8")

    monkeypatch.setattr(encryption_module, "Path", lambda value: network_dir)
    monkeypatch.setattr(service, "_get_uuid_mac_address", lambda: "fallback")

    assert service._get_linux_mac_address() == "001122334455"


def test_windows_mac_address_uses_getmac_then_wmic_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()

    monkeypatch.setattr(
        service,
        "_run_text_command",
        lambda command: subprocess.CompletedProcess(
            list(command),
            0,
            stdout=(
                '"Connection Name","Network Adapter","Physical Address"\n'
                '"vEthernet","Virtual Adapter","00-00-00-00-00-00"\n'
                '"Ethernet","Intel Adapter","AA-BB-CC-DD-EE-FF"\n'
            ),
        ),
    )
    assert service._get_windows_mac_address() == "aabbccddeeff"

    responses = iter(
        (
            subprocess.CompletedProcess(
                ["getmac"],
                1,
                stdout="",
            ),
            subprocess.CompletedProcess(
                ["wmic"],
                0,
                stdout="MACAddress  Name\n11:22:33:44:55:66  Ethernet\n",
            ),
        )
    )
    monkeypatch.setattr(service, "_run_text_command", lambda command: next(responses))
    assert service._get_windows_mac_address() == "112233445566"


def test_macos_and_uuid_mac_fallbacks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()

    monkeypatch.setattr(
        service,
        "_run_text_command",
        lambda command: subprocess.CompletedProcess(
            list(command),
            0,
            stdout="lo0:\n\tenether 00:00:00:00:00:00\nen0:\n\tether ab:cd:ef:12:34:56\n",
        ),
    )
    assert service._get_macos_mac_address() == "abcdef123456"

    monkeypatch.setattr(encryption_module.uuid, "getnode", lambda: 0xAABBCCDDEEFF)
    assert service._get_uuid_mac_address() == "aabbccddeeff"

    monkeypatch.setattr(encryption_module.uuid, "getnode", lambda: 0)
    assert service._get_uuid_mac_address() is None


def test_legacy_machine_features_and_helpers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()
    monkeypatch.setattr(service, "_get_machine_id", lambda: "machine-123")
    monkeypatch.setattr(service, "_get_mac_fallback", lambda: "001122334455")
    monkeypatch.setattr(encryption_module.socket, "gethostname", lambda: "host-a")
    monkeypatch.setattr(encryption_module.platform, "system", lambda: "Linux")
    monkeypatch.setattr(encryption_module.platform, "release", lambda: "6.1")

    assert service._get_legacy_machine_features() == (
        "machine-123|host-a|Linux-6.1",
        "001122334455|host-a|Linux-6.1",
    )
    assert service._is_valid_id("SERIAL123") is True
    assert service._is_valid_id("00000000") is False
    assert service._normalize_mac("aa-bb-cc-dd-ee-ff") == "aabbccddeeff"
    assert service._normalize_mac("ff:ff:ff:ff:ff:ff") is None
    assert service._is_ignored_windows_adapter("Ethernet", "Intel") is False
    assert service._is_ignored_windows_adapter("vethernet", "hyper-v") is True

    def raise_machine_feature_error() -> str:
        raise MachineFeatureError("missing")

    monkeypatch.setattr(service, "_get_machine_id", raise_machine_feature_error)
    monkeypatch.setattr(service, "_get_mac_fallback", lambda: None)
    assert service._get_legacy_machine_features() == ()


def test_run_text_command_handles_success_and_subprocess_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EncryptionService()

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        _ = (args, kwargs)
        return subprocess.CompletedProcess(["cmd"], 0, stdout="ok")

    monkeypatch.setattr(encryption_module.subprocess, "run", fake_run)
    result = service._run_text_command(("cmd",))
    assert result is not None
    assert result.stdout == "ok"

    def fail_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        _ = (args, kwargs)
        raise OSError("missing")

    monkeypatch.setattr(encryption_module.subprocess, "run", fail_run)
    assert service._run_text_command(("missing",)) is None

# -*- coding: utf-8 -*-
from __future__ import annotations

import base64
import csv
import hashlib
import platform
import re
import socket
import subprocess
import uuid
from io import StringIO
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class SecretEncryptionError(RuntimeError):
    pass


class SecretDecryptionError(RuntimeError):
    pass


class MachineFeatureError(RuntimeError):
    pass


class EncryptionService:
    PBKDF2_ITERATIONS = 100_000
    ENCRYPTION_PREFIX = "ENC:"

    def __init__(self) -> None:
        self._cached_key: bytes | None = None
        self._needs_migration = False

    @property
    def needs_migration(self) -> bool:
        return self._needs_migration

    def encrypt(self, plaintext: str) -> str:
        try:
            token = Fernet(self._get_key()).encrypt(plaintext.encode("utf-8"))
        except Exception as exc:
            raise SecretEncryptionError("Failed to encrypt secret.") from exc
        return f"{self.ENCRYPTION_PREFIX}{token.decode('utf-8')}"

    def decrypt(self, ciphertext: str) -> str:
        if not self.is_encrypted(ciphertext):
            raise SecretDecryptionError("Secret value is not encrypted.")

        token = ciphertext[len(self.ENCRYPTION_PREFIX) :].encode("utf-8")
        try:
            return Fernet(self._get_key()).decrypt(token).decode("utf-8")
        except InvalidToken:
            pass
        except Exception as exc:
            raise SecretDecryptionError("Failed to decrypt secret.") from exc

        for features in self._get_legacy_machine_features():
            try:
                plaintext = Fernet(self.derive_key_from_features(features)).decrypt(
                    token
                )
            except InvalidToken:
                continue
            except Exception:
                continue
            self._needs_migration = True
            return plaintext.decode("utf-8")

        raise SecretDecryptionError("Failed to decrypt secret.")

    def is_encrypted(self, data: str) -> bool:
        return data.startswith(self.ENCRYPTION_PREFIX)

    def derive_key_from_features(self, features: str) -> bytes:
        if not features:
            raise MachineFeatureError("Machine features are unavailable.")
        salt = hashlib.sha256(features.encode("utf-8")).digest()
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=self.PBKDF2_ITERATIONS,
            backend=default_backend(),
        )
        return base64.urlsafe_b64encode(kdf.derive(features.encode("utf-8")))

    def collect_machine_features(self) -> str:
        machine_id = self._get_machine_id()
        hostname = socket.gethostname()
        os_info = f"{platform.system()}-{platform.release()}"
        features = f"{machine_id}|{hostname}|{os_info}"
        if not self._is_valid_id(features):
            raise MachineFeatureError("Machine features are unavailable.")
        return features

    def _get_key(self) -> bytes:
        if self._cached_key is None:
            self._cached_key = self.derive_key_from_features(
                self.collect_machine_features()
            )
        return self._cached_key

    def _get_machine_id(self) -> str:
        system = platform.system().lower()
        if system == "windows":
            machine_id = self._get_windows_id()
        elif system == "linux":
            machine_id = self._get_linux_id()
        elif system == "darwin":
            machine_id = self._get_macos_id()
        else:
            machine_id = None
        if machine_id is not None and self._is_valid_id(machine_id):
            return machine_id

        mac_address = self._get_mac_fallback()
        if mac_address is not None and self._is_valid_id(mac_address):
            return mac_address
        raise MachineFeatureError("No stable machine identifier is available.")

    def _get_windows_id(self) -> str | None:
        commands = (
            ("wmic", "csproduct", "get", "UUID"),
            ("wmic", "bios", "get", "serialnumber"),
            ("wmic", "baseboard", "get", "serialnumber"),
        )
        for command in commands:
            result = self._run_text_command(command)
            if result is None or result.returncode != 0:
                continue
            for line in result.stdout.splitlines()[1:]:
                candidate = line.strip()
                if self._is_valid_id(candidate):
                    return candidate
        return None

    def _get_linux_id(self) -> str | None:
        candidates = (
            Path("/etc/machine-id"),
            Path("/sys/class/dmi/id/product_uuid"),
            Path("/sys/class/dmi/id/product_serial"),
            Path("/sys/class/dmi/id/board_serial"),
        )
        for candidate_path in candidates:
            try:
                candidate = candidate_path.read_text(encoding="utf-8").strip()
            except OSError:
                continue
            if self._is_valid_id(candidate):
                return candidate
        return None

    def _get_macos_id(self) -> str | None:
        result = self._run_text_command(
            ("ioreg", "-rd1", "-c", "IOPlatformExpertDevice")
        )
        if result is None or result.returncode != 0:
            return None
        match = re.search(r'IOPlatformUUID\s*=\s*"([^"]+)"', result.stdout)
        if match is None:
            return None
        candidate = match.group(1).strip()
        if self._is_valid_id(candidate):
            return candidate
        return None

    def _get_mac_fallback(self) -> str | None:
        system = platform.system().lower()
        if system == "linux":
            return self._get_linux_mac_address()
        if system == "windows":
            return self._get_windows_mac_address()
        if system == "darwin":
            return self._get_macos_mac_address()
        return self._get_uuid_mac_address()

    def _get_linux_mac_address(self) -> str | None:
        network_dir = Path("/sys/class/net")
        if not network_dir.exists():
            return self._get_uuid_mac_address()
        ignored_prefixes = ("lo", "veth", "docker", "br-", "virbr", "tun", "tap")
        try:
            interfaces = tuple(network_dir.iterdir())
        except OSError:
            return self._get_uuid_mac_address()
        for interface_path in interfaces:
            interface_name = interface_path.name.lower()
            if interface_name.startswith(ignored_prefixes):
                continue
            try:
                candidate = (interface_path / "address").read_text(encoding="utf-8")
            except OSError:
                continue
            normalized = self._normalize_mac(candidate)
            if normalized is not None:
                return normalized
        return self._get_uuid_mac_address()

    def _get_windows_mac_address(self) -> str | None:
        result = self._run_text_command(("getmac", "/v", "/fo", "csv"))
        if result is not None and result.returncode == 0:
            reader = csv.reader(StringIO(result.stdout))
            rows = tuple(reader)
            for row in rows[1:]:
                if len(row) < 3:
                    continue
                connection_name = row[0].strip().lower()
                adapter_name = row[1].strip().lower()
                if self._is_ignored_windows_adapter(connection_name, adapter_name):
                    continue
                normalized = self._normalize_mac(row[2])
                if normalized is not None:
                    return normalized

        result = self._run_text_command(
            (
                "wmic",
                "nic",
                "where",
                "NetConnectionStatus=2",
                "get",
                "MACAddress,Name",
            )
        )
        if result is None or result.returncode != 0:
            return self._get_uuid_mac_address()
        for line in result.stdout.splitlines()[1:]:
            lowered = line.strip().lower()
            if not lowered or self._is_ignored_windows_adapter(lowered, ""):
                continue
            match = re.search(r"([0-9a-f]{2}[:-]){5}[0-9a-f]{2}", lowered)
            if match is None:
                continue
            normalized = self._normalize_mac(match.group(0))
            if normalized is not None:
                return normalized
        return self._get_uuid_mac_address()

    def _get_macos_mac_address(self) -> str | None:
        result = self._run_text_command(("ifconfig",))
        if result is None or result.returncode != 0:
            return self._get_uuid_mac_address()
        current_interface = ""
        for line in result.stdout.splitlines():
            if line and not line.startswith("\t") and not line.startswith(" "):
                current_interface = line.split(":", maxsplit=1)[0].strip().lower()
                continue
            if current_interface.startswith(("lo", "utun", "bridge", "vmnet")):
                continue
            stripped = line.strip().lower()
            if not stripped.startswith("ether "):
                continue
            normalized = self._normalize_mac(stripped.removeprefix("ether "))
            if normalized is not None:
                return normalized
        return self._get_uuid_mac_address()

    def _get_uuid_mac_address(self) -> str | None:
        node = uuid.getnode()
        normalized = self._normalize_mac(f"{node:012x}")
        if normalized is None:
            return None
        return normalized

    def _get_legacy_machine_features(self) -> tuple[str, ...]:
        mac_address = self._get_mac_fallback()
        if mac_address is None:
            return ()
        hostname = socket.gethostname()
        os_info = f"{platform.system()}-{platform.release()}"
        return (f"{mac_address}|{hostname}|{os_info}",)

    def _run_text_command(
        self,
        command: tuple[str, ...],
    ) -> subprocess.CompletedProcess[str] | None:
        try:
            result: subprocess.CompletedProcess[str] = subprocess.run(
                list(command),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="ignore",
                timeout=3.0,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        return result

    def _is_valid_id(self, value: str) -> bool:
        normalized = value.strip().lower()
        if len(normalized) < 8:
            return False
        compact = re.sub(r"[^0-9a-f]", "", normalized)
        invalid_values = {
            "",
            "0" * len(compact),
            "f" * len(compact),
            "default",
            "unknown",
            "none",
            "null",
            "to be filled by o.e.m.",
        }
        return normalized not in invalid_values and compact not in invalid_values

    def _normalize_mac(self, value: str) -> str | None:
        normalized = re.sub(r"[^0-9a-f]", "", value.strip().lower())
        if len(normalized) != 12:
            return None
        if normalized == "0" * 12 or normalized == "f" * 12:
            return None
        return normalized

    def _is_ignored_windows_adapter(
        self,
        connection_name: str,
        adapter_name: str,
    ) -> bool:
        combined = f"{connection_name} {adapter_name}"
        ignored_fragments = (
            "virtual",
            "hyper-v",
            "vmware",
            "vpn",
            "loopback",
            "docker",
            "vethernet",
            "bluetooth",
        )
        return any(fragment in combined for fragment in ignored_fragments)


_ENCRYPTION_SERVICE: EncryptionService | None = None


def get_encryption_service() -> EncryptionService:
    global _ENCRYPTION_SERVICE
    if _ENCRYPTION_SERVICE is None:
        _ENCRYPTION_SERVICE = EncryptionService()
    return _ENCRYPTION_SERVICE

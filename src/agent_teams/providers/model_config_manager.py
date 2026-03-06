# -*- coding: utf-8 -*-
from __future__ import annotations

from json import dumps, loads
from pathlib import Path
from typing import cast

from agent_teams.shared_types.json_types import JsonObject


class ModelConfigManager:
    def __init__(self, *, config_dir: Path) -> None:
        self._config_dir: Path = config_dir

    def get_model_config(self) -> JsonObject:
        model_file = self._config_dir / "model.json"
        if model_file.exists():
            return _load_json_object(model_file)
        return {}

    def get_model_profiles(self) -> dict[str, JsonObject]:
        model_file = self._config_dir / "model.json"
        if not model_file.exists():
            return {}
        config = _load_json_object(model_file)
        result: dict[str, JsonObject] = {}
        for name, profile in config.items():
            if not isinstance(profile, dict):
                continue
            result[name] = {
                "provider": profile.get("provider", "openai_compatible"),
                "model": profile.get("model", ""),
                "base_url": profile.get("base_url", ""),
                "has_api_key": bool(profile.get("api_key")),
                "temperature": profile.get("temperature", 0.7),
                "top_p": profile.get("top_p", 1.0),
                "max_tokens": profile.get("max_tokens", 4096),
            }
        return result

    def save_model_profile(self, name: str, profile: JsonObject) -> None:
        model_file = self._config_dir / "model.json"
        config: JsonObject = {}
        if model_file.exists():
            config = _load_json_object(model_file)
        config[name] = profile
        _ = model_file.write_text(dumps(config, indent=2), encoding="utf-8")

    def delete_model_profile(self, name: str) -> None:
        model_file = self._config_dir / "model.json"
        if not model_file.exists():
            return
        config = _load_json_object(model_file)
        if name in config:
            del config[name]
            _ = model_file.write_text(dumps(config, indent=2), encoding="utf-8")

    def save_model_config(self, config: JsonObject) -> None:
        model_file = self._config_dir / "model.json"
        _ = model_file.write_text(dumps(config, indent=2), encoding="utf-8")


def _load_json_object(file_path: Path) -> JsonObject:
    raw = cast(object, loads(file_path.read_text("utf-8")))
    if isinstance(raw, dict):
        return cast(JsonObject, raw)
    return {}

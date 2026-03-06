# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import cast

from agent_teams.notifications.config_manager import NotificationConfigManager
from agent_teams.notifications.models import NotificationConfig
from agent_teams.shared_types.json_types import JsonObject


class NotificationSettingsService:
    def __init__(
        self,
        *,
        notification_config_manager: NotificationConfigManager,
    ) -> None:
        self._notification_config_manager: NotificationConfigManager = (
            notification_config_manager
        )

    def get_notification_config(self) -> JsonObject:
        config = self._notification_config_manager.get_notification_config()
        return cast(JsonObject, config.model_dump(mode="json"))

    def save_notification_config(self, config: JsonObject) -> None:
        validated = NotificationConfig.model_validate(config)
        self._notification_config_manager.save_notification_config(validated)

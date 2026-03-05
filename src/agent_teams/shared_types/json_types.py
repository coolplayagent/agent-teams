from __future__ import annotations

from collections.abc import Mapping, Sequence

type JsonPrimitive = str | int | float | bool | None
type JsonValue = JsonPrimitive | dict[str, JsonValue] | list[JsonValue]
type JsonObject = dict[str, JsonValue]
type JsonArray = list[JsonValue]

type ReadonlyJsonObject = Mapping[str, JsonValue]
type ReadonlyJsonArray = Sequence[JsonValue]

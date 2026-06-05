# -*- coding: utf-8 -*-
from __future__ import annotations

from enum import Enum
from typing import Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field


class RunKind(str, Enum):
    CONVERSATION = "conversation"
    GENERATE_IMAGE = "generate_image"
    GENERATE_AUDIO = "generate_audio"
    GENERATE_VIDEO = "generate_video"


class RunThinkingConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    enabled: bool = False
    effort: Literal["minimal", "low", "medium", "high"] | None = None


class ImageGenerationConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["image"] = "image"
    count: int = Field(default=1, ge=1, le=8)
    size: str | None = None
    seed: int | None = None


class AudioGenerationConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["audio"] = "audio"
    count: int = Field(default=1, ge=1, le=8)
    voice: str | None = None
    format: str | None = None
    duration_ms: int | None = Field(default=None, ge=0)
    seed: int | None = None


class VideoGenerationConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["video"] = "video"
    count: int = Field(default=1, ge=1, le=4)
    resolution: str | None = None
    duration_ms: int | None = Field(default=None, ge=0)
    seed: int | None = None


MediaGenerationConfig: TypeAlias = (
    ImageGenerationConfig | AudioGenerationConfig | VideoGenerationConfig
)

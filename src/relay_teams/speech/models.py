# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


SUPPORTED_REALTIME_STT_MODELS = frozenset(
    {
        "whisper-1",
        "gpt-4o-transcribe",
        "gpt-4o-transcribe-latest",
        "gpt-4o-mini-transcribe",
        "gpt-4o-mini-transcribe-2025-12-15",
    }
)
NoiseReductionMode = Literal["near_field", "far_field", "disabled"]
SpeechProfileEligibilityReason = Literal[
    "diarization_not_supported",
    "input_audio_not_supported",
    "provider_not_supported",
    "realtime_stt_not_declared",
    "tts_only",
]


class SpeechConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stt_profile_name: str | None = Field(default=None, min_length=1)
    language: str | None = Field(default=None, min_length=2, max_length=16)
    prompt: str | None = Field(default=None, max_length=2000)
    vad_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    vad_prefix_padding_ms: int = Field(default=300, ge=0, le=5000)
    vad_silence_duration_ms: int = Field(default=500, ge=100, le=10000)
    noise_reduction: NoiseReductionMode = "near_field"

    @field_validator("stt_profile_name", "language", "prompt", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value


class SpeechConfigUpdate(SpeechConfig):
    pass


class SpeechProfileEligibility(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eligible: bool
    model: str
    profile_name: str
    reason: SpeechProfileEligibilityReason | None = None


class SpeechConfigView(SpeechConfig):
    model_config = ConfigDict(extra="forbid")

    configured: bool
    profile_eligibility: tuple[SpeechProfileEligibility, ...]

import { apiUrl, requestJson } from "./http";

export interface SpeechConfig {
  configured?: boolean;
  language?: string | null;
  noise_reduction?: "disabled" | "far_field" | "near_field";
  prompt?: string | null;
  stt_profile_name?: string | null;
  profile_eligibility?: SpeechProfileEligibility[];
  vad_prefix_padding_ms?: number;
  vad_silence_duration_ms?: number;
  vad_threshold?: number;
}

export interface SpeechProfileEligibility {
  eligible: boolean;
  model: string;
  profile_name: string;
  reason:
    | "diarization_not_supported"
    | "input_audio_not_supported"
    | "provider_not_supported"
    | "realtime_stt_not_declared"
    | "tts_only"
    | null;
}

export function fetchSpeechConfig(): Promise<SpeechConfig> {
  return requestJson<SpeechConfig>("/speech/config");
}

export function saveSpeechConfig(config: SpeechConfig): Promise<SpeechConfig> {
  return requestJson<SpeechConfig>("/speech/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function createSpeechSttWebSocketUrl(): string {
  const url = new URL(apiUrl("/speech/stt/stream"), window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

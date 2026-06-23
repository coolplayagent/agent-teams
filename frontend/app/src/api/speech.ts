import { apiUrl, requestJson } from "./http";

export interface SpeechConfig {
  configured?: boolean;
  language?: string | null;
  noise_reduction?: "disabled" | "far_field" | "near_field";
  prompt?: string | null;
  stt_profile_name?: string | null;
  supported_models?: string[];
  vad_prefix_padding_ms?: number;
  vad_silence_duration_ms?: number;
  vad_threshold?: number;
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

import { apiUrl, requestJson } from "./http";

export interface SpeechConfig {
  configured?: boolean;
  language?: string | null;
  prompt?: string | null;
  stt_profile_name?: string | null;
}

export function fetchSpeechConfig(): Promise<SpeechConfig> {
  return requestJson<SpeechConfig>("/speech/config");
}

export function createSpeechSttWebSocketUrl(): string {
  const url = new URL(apiUrl("/speech/stt/stream"), window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

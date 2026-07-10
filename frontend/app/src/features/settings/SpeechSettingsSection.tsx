import { App, Button, Form, Input, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getModelProfiles } from "../../api/client";
import type { ModelProfileRecord } from "../../api/contracts";
import { fetchSpeechConfig, saveSpeechConfig } from "../../api/speech";
import type { SpeechConfig } from "../../api/speech";
import { useTranslations } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

interface SpeechFormValues {
  language: string;
  prompt: string;
  stt_profile_name: string;
}

type SpeechProfileUnavailableReason =
  | "diarize"
  | "no_speech"
  | "provider"
  | "tts"
  | "unknown";

interface UnavailableSpeechProfile {
  model: string;
  name: string;
  reason: SpeechProfileUnavailableReason;
}

const SPEECH_LANGUAGE_OPTIONS = [
  ["", "Auto"],
  ["zh-CN", "中文（简体）"],
  ["zh-TW", "中文（繁體）"],
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["ja-JP", "日本語"],
  ["ko-KR", "한국어"],
  ["fr-FR", "Français"],
  ["de-DE", "Deutsch"],
  ["es-ES", "Español"],
] as const;

const KNOWN_STT_MODELS = new Set([
  "whisper-1",
  "gpt-4o-transcribe",
  "gpt-4o-transcribe-latest",
  "gpt-4o-mini-transcribe",
]);

export function SpeechSettingsSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<SpeechFormValues>();
  const speechQuery = useQuery({
    queryKey: ["speech", "config"],
    queryFn: fetchSpeechConfig,
  });
  const profilesQuery = useQuery({
    queryKey: ["settings", "models", "profiles"],
    queryFn: getModelProfiles,
  });
  const saveMutation = useMutation({
    mutationFn: (config: SpeechConfig) => saveSpeechConfig(config),
    onSuccess: () => {
      void message.success(t("settingsSpeechSaved"));
      void queryClient.invalidateQueries({ queryKey: ["speech", "config"] });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });

  useEffect(() => {
    if (speechQuery.data === undefined) {
      return;
    }
    form.setFieldsValue({
      language: speechQuery.data.language ?? "",
      prompt: speechQuery.data.prompt ?? "",
      stt_profile_name: speechQuery.data.stt_profile_name ?? "",
    });
  }, [form, speechQuery.data]);

  const profileEntries = Object.entries(profilesQuery.data ?? {})
    .filter(([, profile]) => isSpeechProfileCandidate(profile))
    .sort(([left], [right]) => left.localeCompare(right));
  const unavailableProfileEntries = Object.entries(profilesQuery.data ?? {})
    .map(([name, profile]) => {
      const reason = speechProfileUnavailableReason(profile);
      if (reason === null) {
        return null;
      }
      return {
        model: profile.model?.trim() || "-",
        name,
        reason,
      };
    })
    .filter((entry): entry is UnavailableSpeechProfile => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedLanguage = Form.useWatch("language", form) ?? "";
  const selectedProfile = speechQuery.data?.stt_profile_name ?? "";
  const hasSelectedProfileOption =
    !selectedProfile || profileEntries.some(([name]) => name === selectedProfile);
  const displayedProfileEntries = hasSelectedProfileOption
    ? profileEntries
    : [[selectedProfile, undefined] as const, ...profileEntries];
  const loading = speechQuery.isLoading || profilesQuery.isLoading;
  const error = speechQuery.error ?? profilesQuery.error;

  function submit(values: SpeechFormValues) {
    const current = speechQuery.data ?? {};
    saveMutation.mutate({
      language: normalizeOptional(values.language),
      noise_reduction: current.noise_reduction,
      prompt: normalizeOptional(values.prompt),
      stt_profile_name: normalizeOptional(values.stt_profile_name),
      vad_prefix_padding_ms: current.vad_prefix_padding_ms,
      vad_silence_duration_ms: current.vad_silence_duration_ms,
      vad_threshold: current.vad_threshold,
    });
  }

  return (
    <SettingsSection title={t("settingsSpeech")}>
      <SettingsQueryState
        error={error}
        loading={loading}
        onRetry={() => {
          void speechQuery.refetch();
          void profilesQuery.refetch();
        }}
      />
      {!loading && error === null ? (
        <Form
          className="at-settings-form at-settings-wide-form"
          form={form}
          layout="vertical"
          onFinish={submit}
        >
          <div className="at-settings-card-list">
            <div className="at-settings-form-card">
              <Form.Item label={t("settingsSpeechSttProfile")} name="stt_profile_name">
                <select
                  className="at-settings-native-select"
                  id="stt_profile_name"
                  name="stt_profile_name"
                >
                  <option value="">{t("settingsSpeechNoProfile")}</option>
                  {displayedProfileEntries.map(([name, profile]) => (
                    <option key={name} value={name}>
                      {profile ? `${name} (${profile.model ?? "-"})` : name}
                    </option>
                  ))}
                </select>
              </Form.Item>
              {profileEntries.length === 0 ? (
                <Typography.Text className="at-settings-help">
                  {t("settingsSpeechNoProfiles")}
                </Typography.Text>
              ) : null}
            </div>
            <div className="at-settings-form-card">
              <Form.Item label={t("settingsSpeechLanguage")} name="language">
                <select
                  className="at-settings-native-select"
                  id="language"
                  name="language"
                >
                  {languageOptions(selectedLanguage).map(([value, label]) => (
                    <option key={value || "auto"} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Form.Item>
              <Form.Item
                label={t("settingsSpeechPrompt")}
                name="prompt"
                rules={[
                  {
                    max: 2000,
                    message: t("settingsSpeechPromptValidation"),
                  },
                ]}
              >
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} />
              </Form.Item>
            </div>
            {unavailableProfileEntries.length > 0 ? (
              <div className="at-settings-form-card at-speech-unavailable">
                <Typography.Text strong>
                  {t("settingsSpeechUnavailableProfiles")}
                </Typography.Text>
                <div className="at-speech-unavailable-list">
                  {unavailableProfileEntries.map((entry) => (
                    <div className="at-speech-unavailable-row" key={entry.name}>
                      <span>
                        <Typography.Text strong>{entry.name}</Typography.Text>
                        <Typography.Text className="at-settings-help">
                          {entry.model}
                        </Typography.Text>
                      </span>
                      <Typography.Text className="at-settings-help">
                        {speechUnavailableReasonLabel(entry.reason, t)}
                      </Typography.Text>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <Button htmlType="submit" loading={saveMutation.isPending} type="primary">
            {t("settingsSave")}
          </Button>
        </Form>
      ) : null}
    </SettingsSection>
  );
}

function languageOptions(selected: string | undefined): Array<readonly [string, string]> {
  const normalizedSelected = selected ?? "";
  if (
    normalizedSelected &&
    !SPEECH_LANGUAGE_OPTIONS.some(([value]) => value === normalizedSelected)
  ) {
    return [...SPEECH_LANGUAGE_OPTIONS, [normalizedSelected, normalizedSelected] as const];
  }
  return [...SPEECH_LANGUAGE_OPTIONS];
}

function isSpeechProfileCandidate(profile: ModelProfileRecord): boolean {
  return speechProfileUnavailableReason(profile) === null;
}

function speechProfileUnavailableReason(
  profile: ModelProfileRecord,
): SpeechProfileUnavailableReason | null {
  const provider = profile.provider?.trim() ?? "";
  const model = profile.model?.trim() ?? "";
  if (provider !== "openai_compatible") {
    return "provider";
  }
  if (resolveRealtimeSpeechModel(profile) === "gpt-4o-transcribe-diarize") {
    return "diarize";
  }
  if (profile.speech_realtime?.model?.trim()) {
    return null;
  }
  if (isKnownRealtimeSttModel(model)) {
    return null;
  }
  const speechCapability = resolveSpeechCapability(profile);
  if (speechCapability === "stt") {
    return null;
  }
  if (speechCapability === "tts") {
    return "tts";
  }
  if (speechCapability === "none") {
    return "no_speech";
  }
  return "unknown";
}

function speechUnavailableReasonLabel(
  reason: SpeechProfileUnavailableReason,
  t: ReturnType<typeof useTranslations>,
): string {
  if (reason === "provider") {
    return t("settingsSpeechReasonProvider");
  }
  if (reason === "diarize") {
    return t("settingsSpeechReasonDiarize");
  }
  if (reason === "tts") {
    return t("settingsSpeechReasonTts");
  }
  if (reason === "no_speech") {
    return t("settingsSpeechReasonNoSpeech");
  }
  return t("settingsSpeechReasonUnknown");
}

function resolveRealtimeSpeechModel(profile: ModelProfileRecord): string {
  return profile.speech_realtime?.model?.trim() || profile.model?.trim() || "";
}

function isKnownRealtimeSttModel(model: string): boolean {
  return KNOWN_STT_MODELS.has(model) || model.startsWith("gpt-4o-mini-transcribe-");
}

function resolveSpeechCapability(profile: ModelProfileRecord): "none" | "stt" | "tts" | "unknown" {
  const capabilities = profile.resolved_capabilities ?? profile.capabilities;
  const inputAudio = capabilities?.input?.audio;
  const outputAudio = capabilities?.output?.audio;
  if (inputAudio === true) {
    return "stt";
  }
  if (outputAudio === true) {
    return "tts";
  }
  if (inputAudio === false && outputAudio === false) {
    return "none";
  }
  return "unknown";
}

function normalizeOptional(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

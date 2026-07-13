import { App, Button, Form, Input, Select, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { fetchSpeechConfig, saveSpeechConfig } from "../../api/speech";
import type { SpeechConfig, SpeechProfileEligibility } from "../../api/speech";
import { useTranslations } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

interface SpeechFormValues {
  language: string;
  prompt: string;
  stt_profile_name: string;
}

interface UnavailableSpeechProfile {
  model: string;
  name: string;
  reason: Exclude<SpeechProfileEligibility["reason"], null>;
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

export function SpeechSettingsSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<SpeechFormValues>();
  const speechQuery = useQuery({
    queryKey: ["speech", "config"],
    queryFn: fetchSpeechConfig,
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

  const eligibility = speechQuery.data?.profile_eligibility ?? [];
  const profileEntries = eligibility.filter((entry) => entry.eligible);
  const unavailableProfileEntries = eligibility
    .filter(
      (entry): entry is SpeechProfileEligibility & { reason: Exclude<SpeechProfileEligibility["reason"], null> } =>
        !entry.eligible && entry.reason !== null,
    )
    .map((entry) => ({ model: entry.model, name: entry.profile_name, reason: entry.reason }))
    .filter((entry): entry is UnavailableSpeechProfile => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedLanguage = Form.useWatch("language", form) ?? "";
  const selectedProfile = speechQuery.data?.stt_profile_name ?? "";
  const hasSelectedProfileOption =
    !selectedProfile || profileEntries.some((entry) => entry.profile_name === selectedProfile);
  const displayedProfileEntries = hasSelectedProfileOption
    ? profileEntries
    : [{ eligible: true, model: "", profile_name: selectedProfile, reason: null }, ...profileEntries];
  const loading = speechQuery.isLoading;
  const error = speechQuery.error;

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
        }}
      />
      {!loading && error === null ? (
        <Form
          className="at-settings-form at-settings-wide-form"
          form={form}
          layout="vertical"
          onFinish={submit}
        >
            <div className="at-settings-form-layout">
            <div className="at-settings-form-card-layout">
              <Form.Item label={t("settingsSpeechSttProfile")} name="stt_profile_name">
                <Select
                  optionFilterProp="label"
                  options={[
                    { label: t("settingsSpeechNoProfile"), value: "" },
                    ...displayedProfileEntries.map((profile) => ({
                      label: profile.model ? `${profile.profile_name} (${profile.model})` : profile.profile_name,
                      value: profile.profile_name,
                    })),
                  ]}
                  showSearch
                />
              </Form.Item>
              {profileEntries.length === 0 ? (
                <Typography.Text className="at-settings-help">
                  {t("settingsSpeechNoProfiles")}
                </Typography.Text>
              ) : null}
            </div>
            <div className="at-settings-form-card-layout">
              <Form.Item label={t("settingsSpeechLanguage")} name="language">
                <Select
                  optionFilterProp="label"
                  options={languageOptions(selectedLanguage).map(([value, label]) => ({
                    label,
                    value,
                  }))}
                  showSearch
                />
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
              <div className="at-settings-form-card-layout at-speech-unavailable">
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

function speechUnavailableReasonLabel(
  reason: Exclude<SpeechProfileEligibility["reason"], null>,
  t: ReturnType<typeof useTranslations>,
): string {
  if (reason === "provider_not_supported") {
    return t("settingsSpeechReasonProvider");
  }
  if (reason === "diarization_not_supported") {
    return t("settingsSpeechReasonDiarize");
  }
  if (reason === "tts_only") {
    return t("settingsSpeechReasonTts");
  }
  if (reason === "input_audio_not_supported") {
    return t("settingsSpeechReasonNoSpeech");
  }
  return t("settingsSpeechReasonUnknown");
}

function normalizeOptional(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

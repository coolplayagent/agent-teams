import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { createSpeechSttWebSocketUrl, fetchSpeechConfig } from "../../api/speech";
import { type Translate, useTranslations } from "../../i18n";

type VoiceInputState =
  | "idle"
  | "starting"
  | "connecting"
  | "listening"
  | "transcribing"
  | "error";

interface AudioContextWindow extends Window {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
}

interface AudioContextConstructor {
  new (): AudioContext;
}

interface VoiceDraftSelection {
  selectionEnd: number;
  selectionStart: number;
  text: string;
}

interface VoiceInputSession {
  audioContext: AudioContext;
  buffer: ArrayBuffer[];
  closed: boolean;
  completedText: string;
  deltaText: string;
  finalizeTimer: number | null;
  flushTimer: number | null;
  gain: GainNode | null;
  ignoreTextUpdates: boolean;
  prefix: string;
  processor: ScriptProcessorNode | null;
  readyForAudio: boolean;
  socket: WebSocket;
  source: MediaStreamAudioSourceNode | null;
  stopping: boolean;
  stream: MediaStream;
  suffix: string;
  targetSampleRate: number;
  token: number;
}

interface UseVoiceInputOptions {
  disabled: boolean;
  onError: (message: string) => void;
  onTextChange: (value: string) => void;
}

interface VoiceInputController {
  ariaLabel: string;
  disabled: boolean;
  errorMessage: string;
  isAvailable: boolean;
  isBusy: boolean;
  state: VoiceInputState;
  stop: (options?: VoiceInputStopOptions) => void;
  toggle: (selection: VoiceDraftSelection) => void;
  tooltip: string;
  visible: boolean;
}

interface VoiceInputStopOptions {
  ignoreTextUpdates?: boolean;
}

const TARGET_SAMPLE_RATE = 16000;
const SEND_INTERVAL_MS = 80;
const FINALIZE_TIMEOUT_MS = 8000;
const OPEN_WEB_SOCKET_STATE = 1;

export function useVoiceInput({
  disabled,
  onError,
  onTextChange,
}: UseVoiceInputOptions): VoiceInputController {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const stateRef = useRef<VoiceInputState>("idle");
  const sessionRef = useRef<VoiceInputSession | null>(null);
  const nextTokenRef = useRef(1);
  const onErrorRef = useRef(onError);
  const onTextChangeRef = useRef(onTextChange);
  const translate = useTranslations();
  const translateRef = useRef(translate);
  const speechConfigQuery = useQuery({
    queryKey: ["speech", "config"],
    queryFn: fetchSpeechConfig,
    staleTime: 30000,
  });
  const hasRuntimeSupport = useMemo(() => hasVoiceRuntimeSupport(), []);
  const configured = speechConfigQuery.data?.configured === true;
  const isBusy = state !== "idle" && state !== "error";
  const isAvailable = hasRuntimeSupport && configured;
  const visible = configured || isBusy;
  const canStart = !disabled && isAvailable;
  const buttonDisabled =
    !visible ||
    state === "transcribing" ||
    (!isBusy && (!canStart || speechConfigQuery.isLoading));
  const tooltip = isBusy
    ? translate("composerVoiceStop")
    : resolveVoiceTooltip(translate, {
        configured,
        disabled,
        hasRuntimeSupport,
        loading: speechConfigQuery.isLoading,
      });
  const ariaLabel = isBusy ? resolveVoiceStatusLabel(translate, state) : tooltip;

  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

  useEffect(
    () => () => {
      closeCurrentSession();
    },
    [],
  );

  const toggle = useCallback(
    (selection: VoiceDraftSelection) => {
      if (sessionRef.current !== null) {
        stopVoiceInput();
        return;
      }
      if (stateRef.current === "starting" || stateRef.current === "connecting") {
        cancelVoiceStart();
        return;
      }
      void startVoiceInput(selection);
    },
    [canStart],
  );

  const stop = useCallback((options: VoiceInputStopOptions = {}) => {
    const session = sessionRef.current;
    if (session !== null) {
      stopVoiceInput(options);
      return;
    }
    if (stateRef.current === "starting" || stateRef.current === "connecting") {
      cancelVoiceStart();
    }
  }, []);

  return {
    ariaLabel,
    disabled: buttonDisabled,
    errorMessage,
    isAvailable,
    isBusy,
    state,
    stop,
    toggle,
    tooltip,
    visible,
  };

  async function startVoiceInput(selection: VoiceDraftSelection): Promise<void> {
    if (!canStart || sessionRef.current !== null) {
      return;
    }
    const audioContextCtor = resolveAudioContextConstructor();
    if (!audioContextCtor || !navigator.mediaDevices?.getUserMedia || !window.WebSocket) {
      failVoiceInput(translateRef.current("composerVoiceBrowserUnsupported"));
      return;
    }
    const token = nextTokenRef.current;
    nextTokenRef.current += 1;
    setVoiceState("starting");
    setErrorMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrentToken(token)) {
        stopStream(stream);
        return;
      }
      const audioContext = new audioContextCtor();
      const socket = new WebSocket(createSpeechSttWebSocketUrl());
      socket.binaryType = "arraybuffer";
      const session = createSession({
        audioContext,
        selection,
        socket,
        stream,
        token,
      });
      sessionRef.current = session;
      bindSocket(session);
      await startAudioPipeline(session);
      if (!isCurrentSession(session)) {
        return;
      }
      setVoiceState("connecting");
    } catch (error) {
      await cleanupFailedStart(
        errorMessageFromUnknown(error, translateRef.current),
      );
    }
  }

  function stopVoiceInput(options: VoiceInputStopOptions = {}): void {
    const session = sessionRef.current;
    if (session === null) {
      setVoiceState("idle");
      return;
    }
    if (session.stopping || stateRef.current === "transcribing") {
      if (options.ignoreTextUpdates === true) {
        session.ignoreTextUpdates = true;
      }
      return;
    }
    if (options.ignoreTextUpdates === true) {
      session.ignoreTextUpdates = true;
    }
    session.stopping = true;
    stopAudioCapture(session);
    flushAudio(session);
    if (session.socket.readyState === OPEN_WEB_SOCKET_STATE) {
      session.socket.send(JSON.stringify({ type: "stop" }));
      setVoiceState("transcribing");
      session.finalizeTimer = window.setTimeout(() => {
        closeSession(session);
      }, FINALIZE_TIMEOUT_MS);
      return;
    }
    void closeSession(session);
  }

  function cancelVoiceStart(): void {
    nextTokenRef.current += 1;
    setVoiceState("idle");
  }

  function bindSocket(session: VoiceInputSession): void {
    session.socket.addEventListener("open", () => {
      if (!isCurrentSession(session)) {
        return;
      }
      session.socket.send(JSON.stringify({ type: "start" }));
    });
    session.socket.addEventListener("message", (event) => {
      handleVoiceMessage(session, event);
    });
    session.socket.addEventListener("error", () => {
      if (!isCurrentSession(session)) {
        return;
      }
      failVoiceInput(translateRef.current("composerVoiceStreamFailed"));
      closeSession(session, { keepErrorState: true });
    });
    session.socket.addEventListener("close", () => {
      if (!isCurrentSession(session)) {
        return;
      }
      closeSession(session);
    });
  }

  function handleVoiceMessage(session: VoiceInputSession, event: MessageEvent): void {
    if (!isCurrentSession(session)) {
      return;
    }
    const payload = parseVoicePayload(event.data);
    if (payload === null) {
      return;
    }
    const type = String(payload.type ?? "");
    if (type === "status") {
      handleStatusMessage(session, payload);
      return;
    }
    if (type === "speech") {
      handleSpeechMessage(session, payload);
      return;
    }
    if (type === "delta") {
      handleDeltaMessage(session, payload);
      return;
    }
    if (type === "completed") {
      handleCompletedMessage(session, payload);
      return;
    }
    if (type === "error") {
      failVoiceInput(resolveVoiceStreamError(translateRef.current, payload));
      closeSession(session, { keepErrorState: true });
    }
  }

  function handleStatusMessage(
    session: VoiceInputSession,
    payload: Record<string, unknown>,
  ): void {
    const status = String(payload.status ?? "");
    if (status === "ready" || status === "connected") {
      const sampleRate = Number(payload.sample_rate);
      if (Number.isFinite(sampleRate) && sampleRate > 0) {
        if (!session.readyForAudio && sampleRate !== session.targetSampleRate) {
          session.buffer = [];
        }
        session.targetSampleRate = sampleRate;
      }
      session.readyForAudio = true;
      flushAudio(session);
      setVoiceState("listening");
      return;
    }
    if (status === "speech_started") {
      setVoiceState("listening");
      return;
    }
    if (status === "speech_stopped" && !session.stopping) {
      setVoiceState("listening");
    }
  }

  function handleSpeechMessage(
    session: VoiceInputSession,
    payload: Record<string, unknown>,
  ): void {
    const status = String(payload.status ?? "");
    if (status === "started") {
      setVoiceState("listening");
      return;
    }
    if (status === "stopped" && !session.stopping) {
      setVoiceState("listening");
    }
  }

  function handleDeltaMessage(
    session: VoiceInputSession,
    payload: Record<string, unknown>,
  ): void {
    const text = String(payload.text ?? "");
    session.deltaText =
      payload.mode === "replace" ? text : `${session.deltaText}${text}`;
    if (stateRef.current !== "listening") {
      setVoiceState("transcribing");
    }
    renderPromptText(session);
  }

  function handleCompletedMessage(
    session: VoiceInputSession,
    payload: Record<string, unknown>,
  ): void {
    const completed = String(payload.text ?? "").trim();
    session.completedText = joinVoiceText(
      session.completedText,
      completed || session.deltaText,
    );
    session.deltaText = "";
    renderPromptText(session);
    if (session.stopping) {
      closeSession(session);
    }
  }

  function renderPromptText(session: VoiceInputSession): void {
    if (session.ignoreTextUpdates) {
      return;
    }
    const spokenText = joinVoiceText(session.completedText, session.deltaText);
    onTextChangeRef.current(`${session.prefix}${spokenText}${session.suffix}`);
  }

  async function startAudioPipeline(session: VoiceInputSession): Promise<void> {
    if (session.audioContext.state === "suspended") {
      await session.audioContext.resume();
    }
    if (!isCurrentSession(session)) {
      return;
    }
    const source = session.audioContext.createMediaStreamSource(session.stream);
    const processor = session.audioContext.createScriptProcessor(4096, 1, 1);
    const gain = session.audioContext.createGain();
    gain.gain.value = 0;
    session.source = source;
    session.processor = processor;
    session.gain = gain;
    processor.onaudioprocess = (event) => {
      if (!isCurrentSession(session) || session.stopping) {
        return;
      }
      const inputData = event.inputBuffer.getChannelData(0);
      const frame = floatToPcm16(
        downsample(
          inputData,
          session.audioContext.sampleRate,
          session.targetSampleRate,
        ),
      );
      enqueueAudioFrame(session, frame);
    };
    source.connect(processor);
    processor.connect(gain);
    gain.connect(session.audioContext.destination);
    session.flushTimer = window.setInterval(() => {
      flushAudio(session);
    }, SEND_INTERVAL_MS);
  }

  function enqueueAudioFrame(session: VoiceInputSession, frame: ArrayBuffer): void {
    if (!isCurrentSession(session) || frame.byteLength === 0) {
      return;
    }
    session.buffer.push(frame);
    flushAudio(session);
  }

  function flushAudio(session: VoiceInputSession): void {
    if (
      !isCurrentSession(session) ||
      session.socket.readyState !== OPEN_WEB_SOCKET_STATE ||
      !session.readyForAudio ||
      session.buffer.length === 0
    ) {
      return;
    }
    const totalLength = session.buffer.reduce(
      (sum, frame) => sum + frame.byteLength,
      0,
    );
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    session.buffer.forEach((frame) => {
      merged.set(new Uint8Array(frame), offset);
      offset += frame.byteLength;
    });
    session.buffer = [];
    session.socket.send(merged.buffer);
  }

  async function cleanupFailedStart(message: string): Promise<void> {
    const session = sessionRef.current;
    if (session !== null) {
      await closeSession(session, { keepErrorState: true });
    }
    failVoiceInput(message);
  }

  async function closeCurrentSession(): Promise<void> {
    const session = sessionRef.current;
    if (session !== null) {
      await closeSession(session);
    }
  }

  async function closeSession(
    session: VoiceInputSession,
    options: { keepErrorState?: boolean } = {},
  ): Promise<void> {
    if (session.closed) {
      return;
    }
    session.closed = true;
    if (sessionRef.current === session) {
      sessionRef.current = null;
    }
    if (session.finalizeTimer !== null) {
      window.clearTimeout(session.finalizeTimer);
      session.finalizeTimer = null;
    }
    stopAudioCapture(session);
    try {
      if (
        session.socket.readyState === OPEN_WEB_SOCKET_STATE ||
        session.socket.readyState === WebSocket.CONNECTING
      ) {
        session.socket.close();
      }
    } finally {
      await session.audioContext.close();
      if (options.keepErrorState !== true) {
        setVoiceState("idle");
      }
    }
  }

  function stopAudioCapture(session: VoiceInputSession): void {
    if (session.flushTimer !== null) {
      window.clearInterval(session.flushTimer);
      session.flushTimer = null;
    }
    session.processor?.disconnect();
    session.gain?.disconnect();
    session.source?.disconnect();
    session.processor = null;
    session.gain = null;
    session.source = null;
    stopStream(session.stream);
  }

  function failVoiceInput(message: string): void {
    setErrorMessage(message);
    setVoiceState("error");
    onErrorRef.current(message);
  }

  function setVoiceState(nextState: VoiceInputState): void {
    stateRef.current = nextState;
    setState(nextState);
  }

  function isCurrentSession(session: VoiceInputSession): boolean {
    return sessionRef.current === session && !session.closed;
  }

  function isCurrentToken(token: number): boolean {
    return token === nextTokenRef.current - 1;
  }
}

function createSession({
  audioContext,
  selection,
  socket,
  stream,
  token,
}: {
  audioContext: AudioContext;
  selection: VoiceDraftSelection;
  socket: WebSocket;
  stream: MediaStream;
  token: number;
}): VoiceInputSession {
  const selectionStart = clampSelectionIndex(selection.selectionStart, selection.text);
  const selectionEnd = clampSelectionIndex(selection.selectionEnd, selection.text);
  return {
    audioContext,
    buffer: [],
    closed: false,
    completedText: "",
    deltaText: "",
    finalizeTimer: null,
    flushTimer: null,
    gain: null,
    ignoreTextUpdates: false,
    prefix: selection.text.slice(0, Math.min(selectionStart, selectionEnd)),
    processor: null,
    readyForAudio: false,
    socket,
    source: null,
    stopping: false,
    stream,
    suffix: selection.text.slice(Math.max(selectionStart, selectionEnd)),
    targetSampleRate: TARGET_SAMPLE_RATE,
    token,
  };
}

function hasVoiceRuntimeSupport(): boolean {
  return Boolean(
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
      resolveAudioContextConstructor() &&
      typeof window.WebSocket === "function",
  );
}

function resolveAudioContextConstructor(): AudioContextConstructor | null {
  const audioWindow = window as AudioContextWindow;
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function resolveVoiceTooltip(
  translate: Translate,
  {
    configured,
    disabled,
    hasRuntimeSupport,
    loading,
  }: {
    configured: boolean;
    disabled: boolean;
    hasRuntimeSupport: boolean;
    loading: boolean;
  },
): string {
  if (loading) {
    return translate("composerVoiceLoading");
  }
  if (disabled) {
    return translate("composerVoiceSelectSession");
  }
  if (!hasRuntimeSupport) {
    return translate("composerVoiceUnsupported");
  }
  if (!configured) {
    return translate("composerVoiceConfigure");
  }
  return translate("composerVoiceInput");
}

function resolveVoiceStatusLabel(
  translate: Translate,
  state: VoiceInputState,
): string {
  if (state === "starting" || state === "connecting") {
    return translate("composerVoiceConnecting");
  }
  if (state === "transcribing") {
    return translate("composerVoiceTranscribing");
  }
  return translate("composerVoiceStop");
}

function resolveVoiceStreamError(
  translate: Translate,
  payload: Record<string, unknown>,
): string {
  if (payload.code === "missing_config") {
    return translate("composerVoiceConfigure");
  }
  return translate("composerVoiceStreamFailed");
}

function parseVoicePayload(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    const payload = JSON.parse(data) as unknown;
    if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function joinVoiceText(left: string, right: string): string {
  const first = left.trim();
  const second = right.trim();
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  return `${first} ${second}`;
}

function downsample(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) {
    return input;
  }
  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    output[index] = input[Math.min(input.length - 1, Math.floor(index * ratio))];
  }
  return output;
}

function floatToPcm16(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

function clampSelectionIndex(value: number, text: string): number {
  if (!Number.isFinite(value)) {
    return text.length;
  }
  return Math.max(0, Math.min(text.length, value));
}

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function errorMessageFromUnknown(error: unknown, translate: Translate): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return translate("composerVoiceMicrophonePermissionDenied");
    }
    if (error.name === "NotFoundError" || error.name === "NotReadableError") {
      return translate("composerVoiceMicrophoneUnavailable");
    }
  }
  return translate("composerVoiceStartFailed");
}

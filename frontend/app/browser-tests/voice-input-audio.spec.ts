import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { serveFrontendDist } from "./support/frontend-app";

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 900;
const WAIT_TIMEOUT_MS = 10_000;

interface VoiceProbeWindow {
  __relayTeamsVoiceInputActive?: boolean;
  __voiceProbe: {
    closed: number;
    sent: string[];
  };
}

interface VoiceRuntimeResult {
  active: boolean;
  sent: string[];
  state: string;
}

interface VoiceHeldResult extends VoiceRuntimeResult {
  focused: boolean;
}

interface VoiceCloseResult extends VoiceRuntimeResult {
  closed: number;
}

interface SpeechUnavailableResult {
  active: boolean;
  disabled: boolean;
  hidden: boolean;
  value: string;
}

interface WorkletResult {
  audio?: number;
  hasBytes?: boolean;
  levelOnly?: number;
  maxLevel?: number;
  supported: boolean;
  total?: number;
  totalBytes?: number;
}

interface ComposerLayoutScenario {
  collisions: string[];
  name: string;
  promptPaddingRight: number;
  railFitsPromptPadding: boolean;
  railInsideWrapper: boolean;
  railWidth: number;
  wrapperWidth: number;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({
    height: VIEWPORT_HEIGHT,
    width: VIEWPORT_WIDTH,
  });
});

test("voice input sends PCM bytes and stops after silence", async ({
  context,
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await prepareVoiceInputPage(context, page, appServer.url, {
      configScript:
        "window.__relayTeamsVoiceInputTestConfig = { silenceAutoStopMs: 200, speechStopGraceMs: 100 };",
      probeScript: voiceAudioProbeScript(),
    });

    await page.locator("#voice-input-btn").click();

    await waitForVoiceState(page, "listening");
    await page.waitForFunction(
      () =>
        (window as unknown as VoiceProbeWindow).__voiceProbe.sent.some((item) =>
          String(item).startsWith("bytes:"),
        ),
      undefined,
      { timeout: WAIT_TIMEOUT_MS },
    );
    await waitForVoiceState(page, "idle");

    const result = await readVoiceRuntime(page);

    expect(result.state).toBe("idle");
    expect(result.active).toBe(false);
    expect(result.sent).toContain('{"type":"start"}');
    expect(result.sent).toContain('{"type":"stop"}');
    expect(result.sent.some((item) => item.startsWith("bytes:"))).toBe(true);
  } finally {
    await appServer.close();
  }
});

test("holding space focuses the prompt and suppresses silence stop", async ({
  context,
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await prepareVoiceInputPage(context, page, appServer.url, {
      probeScript: voiceAudioProbeScript(),
    });

    await page.mouse.click(500, 260);
    await page.keyboard.down("Space");
    await waitForVoiceState(page, "listening");
    await page.waitForTimeout(450);
    const held = await page.evaluate<VoiceHeldResult>(() => {
      const voiceWindow = window as unknown as VoiceProbeWindow;
      return {
        active: voiceWindow.__relayTeamsVoiceInputActive === true,
        focused:
          document.activeElement === document.querySelector("#prompt-input"),
        sent: voiceWindow.__voiceProbe.sent,
        state:
          document.querySelector<HTMLButtonElement>("#voice-input-btn")?.dataset
            .voiceState ?? "",
      };
    });

    await page.keyboard.up("Space");
    await waitForVoiceState(page, "idle");
    const released = await readVoiceRuntime(page);

    expect(held.state).toBe("listening");
    expect(held.active).toBe(true);
    expect(held.focused).toBe(true);
    expect(held.sent).not.toContain('{"type":"stop"}');
    expect(released.state).toBe("idle");
    expect(released.active).toBe(false);
    expect(released.sent).toContain('{"type":"stop"}');
  } finally {
    await appServer.close();
  }
});

test("voice input stops when WebSocket backpressure persists", async ({
  context,
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await prepareVoiceInputPage(context, page, appServer.url, {
      probeScript: voiceAudioProbeScript({ backpressured: true }),
    });

    await page.locator("#voice-input-btn").click();

    await waitForVoiceState(page, "listening");
    await waitForVoiceState(page, "idle");
    const result = await readVoiceRuntime(page);

    expect(result.state).toBe("idle");
    expect(result.active).toBe(false);
    expect(result.sent[0]).toBe('{"type":"start"}');
    expect(result.sent.at(-1)).toBe('{"type":"stop"}');
    expect(result.sent.some((item) => item.startsWith("bytes:"))).toBe(true);
  } finally {
    await appServer.close();
  }
});

test("voice input closes WebSocket when finalize times out", async ({
  context,
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await prepareVoiceInputPage(context, page, appServer.url, {
      configScript:
        "window.__relayTeamsVoiceInputTestConfig = { finalizeTimeoutMs: 150 };",
      probeScript: voiceAudioProbeScript({ closeOnStop: false }),
    });

    await page.locator("#voice-input-btn").click();

    await waitForVoiceState(page, "listening");
    await waitForVoiceState(page, "idle");
    const result = await page.evaluate<VoiceCloseResult>(() => {
      const voiceWindow = window as unknown as VoiceProbeWindow;
      return {
        active: voiceWindow.__relayTeamsVoiceInputActive === true,
        closed: voiceWindow.__voiceProbe.closed,
        sent: voiceWindow.__voiceProbe.sent,
        state:
          document.querySelector<HTMLButtonElement>("#voice-input-btn")?.dataset
            .voiceState ?? "",
      };
    });

    expect(result.state).toBe("idle");
    expect(result.active).toBe(false);
    expect(result.sent).toContain('{"type":"start"}');
    expect(result.sent).toContain('{"type":"stop"}');
    expect(result.closed).toBe(1);
  } finally {
    await appServer.close();
  }
});

test("voice input drops pre-ready audio after sample-rate negotiation", async ({
  context,
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await prepareVoiceInputPage(context, page, appServer.url, {
      probeScript: voiceAudioProbeScript({
        readyDelayMs: 360,
        sampleRate: 24000,
      }),
    });

    await page.locator("#voice-input-btn").click();

    await page.waitForFunction(
      () =>
        (window as unknown as VoiceProbeWindow).__voiceProbe.sent.some((item) =>
          String(item).startsWith("bytes:"),
        ),
      undefined,
      { timeout: WAIT_TIMEOUT_MS },
    );
    const byteCounts = await page.evaluate<number[]>(() => {
      const voiceWindow = window as unknown as VoiceProbeWindow;
      return voiceWindow.__voiceProbe.sent
        .filter((item) => String(item).startsWith("bytes:"))
        .map((item) => Number(String(item).slice(6)));
    });

    expect(byteCounts.length).toBeGreaterThan(0);
    expect(byteCounts.every((byteCount) => byteCount % 4096 === 0)).toBe(true);
  } finally {
    await appServer.close();
  }
});

test("voice button hides without STT config and space remains text input", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await routeSpeechConfig(page, false);
    await openLegacyFrontend(page, appServer.url);
    await page.waitForFunction(
      () => {
        const button =
          document.querySelector<HTMLButtonElement>("#voice-input-btn");
        return button?.hidden === true && button.disabled === true;
      },
      undefined,
      { timeout: WAIT_TIMEOUT_MS },
    );
    await page.locator("#prompt-input").fill("hello");
    await page.keyboard.press("Space");

    const result = await page.evaluate<SpeechUnavailableResult>(() => {
      const voiceWindow = window as unknown as VoiceProbeWindow;
      const button = document.querySelector<HTMLButtonElement>("#voice-input-btn");
      return {
        active: voiceWindow.__relayTeamsVoiceInputActive === true,
        disabled: button?.disabled === true,
        hidden: button?.hidden === true,
        value:
          document.querySelector<HTMLInputElement>("#prompt-input")?.value ?? "",
      };
    });

    expect(result.hidden).toBe(true);
    expect(result.disabled).toBe(true);
    expect(result.value).toBe("hello ");
    expect(result.active).toBe(false);
  } finally {
    await appServer.close();
  }
});

test("voice input worklet emits chunked audio without level message storm", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await openLegacyFrontend(page, appServer.url);
    const result = await page.evaluate<WorkletResult>(
      async () => {
        if (!window.OfflineAudioContext || !window.AudioWorkletNode) {
          return { supported: false };
        }
        const renderWorklet = async (configuredSampleRate: number | null) => {
          const context = new OfflineAudioContext(1, 48000, 48000);
          await context.audioWorklet.addModule(
            "/js/components/voiceInputWorklet.js",
          );
          const node = new AudioWorkletNode(
            context,
            "relay-teams-voice-input",
            { processorOptions: { targetSampleRate: 16000 } },
          );
          if (configuredSampleRate !== null) {
            node.port.postMessage({
              targetSampleRate: configuredSampleRate,
              type: "configure",
            });
          }
          const oscillator = new OscillatorNode(context, { frequency: 440 });
          const gain = new GainNode(context, { gain: 0.2 });
          const messages: Array<{ bytes: number; level: number; type: string }> =
            [];
          node.port.onmessage = (event: MessageEvent) => {
            const data = event.data as {
              audio?: ArrayBuffer;
              level?: number;
              type?: string;
            };
            messages.push({
              bytes: data.audio?.byteLength ?? 0,
              level: data.level ?? 0,
              type: data.type ?? "",
            });
          };
          oscillator.connect(gain).connect(node).connect(context.destination);
          oscillator.start(0);
          oscillator.stop(1);
          await context.startRendering();
          return messages;
        };
        const messages = await renderWorklet(24000);
        return {
          audio: messages.filter((item) => item.type === "audio").length,
          hasBytes: messages.some((item) => item.bytes > 0),
          levelOnly: messages.filter((item) => item.type === "level").length,
          maxLevel: Math.max(...messages.map((item) => item.level)),
          supported: true,
          total: messages.length,
          totalBytes: messages.reduce((sum, item) => sum + item.bytes, 0),
        };
      },
      undefined,
    );

    expect(result.supported).toBe(true);
    expect(result.audio).toBeGreaterThan(0);
    expect(result.levelOnly).toBe(0);
    expect(result.hasBytes).toBe(true);
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.maxLevel).toBeGreaterThan(0);
    expect(result.total).toBeLessThanOrEqual(14);
  } finally {
    await appServer.close();
  }
});

test("composer action buttons do not overlap in runtime states", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  try {
    await routeSpeechConfig(page);
    await openLegacyFrontend(page, appServer.url);
    await page.waitForSelector(".composer-actions", {
      state: "attached",
      timeout: WAIT_TIMEOUT_MS,
    });

    const result = await page.evaluate<ComposerLayoutScenario[]>(
      composerActionLayoutProbeScript(false),
    );

    assertComposerActionLayout(result);
  } finally {
    await appServer.close();
  }
});

test("new session composer action buttons do not overlap", async ({
  context,
}) => {
  const appServer = await serveFrontendDist();
  const widePage = await context.newPage();
  const narrowPage = await context.newPage();
  try {
    await widePage.setViewportSize({
      height: VIEWPORT_HEIGHT,
      width: VIEWPORT_WIDTH,
    });
    await routeSpeechConfig(widePage);
    await openLegacyFrontend(widePage, appServer.url);
    await widePage.waitForSelector(".composer-actions", {
      state: "attached",
      timeout: WAIT_TIMEOUT_MS,
    });
    const wideResult = await widePage.evaluate<ComposerLayoutScenario[]>(
      composerActionLayoutProbeScript(true),
    );

    await narrowPage.setViewportSize({ height: 780, width: 520 });
    await routeSpeechConfig(narrowPage);
    await openLegacyFrontend(narrowPage, appServer.url);
    await narrowPage.waitForSelector(".composer-actions", {
      state: "attached",
      timeout: WAIT_TIMEOUT_MS,
    });
    const narrowResult = await narrowPage.evaluate<ComposerLayoutScenario[]>(
      composerActionLayoutProbeScript(true),
    );

    assertComposerActionLayout(wideResult);
    assertComposerActionLayout(narrowResult);
  } finally {
    await widePage.close();
    await narrowPage.close();
    await appServer.close();
  }
});

async function prepareVoiceInputPage(
  context: BrowserContext,
  page: Page,
  baseUrl: string,
  options: {
    configScript?: string;
    probeScript: string;
  },
): Promise<void> {
  await context.grantPermissions(["microphone"], { origin: baseUrl });
  if (options.configScript !== undefined) {
    await context.addInitScript({ content: options.configScript });
  }
  await context.addInitScript({ content: options.probeScript });
  await routeSpeechConfig(page);
  await openLegacyFrontend(page, baseUrl);
  await page.waitForSelector("#voice-input-btn", {
    state: "attached",
    timeout: WAIT_TIMEOUT_MS,
  });
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLButtonElement>("#voice-input-btn")
        ?.disabled === false,
    undefined,
    { timeout: WAIT_TIMEOUT_MS },
  );
}

async function openLegacyFrontend(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/`, { waitUntil: "load" });
}

async function routeSpeechConfig(
  page: Page,
  configured = true,
): Promise<void> {
  const body = configured
    ? {
        configured: true,
        language: "zh-CN",
        prompt: null,
        stt_profile_name: "test-stt",
      }
    : {
        configured: false,
        language: "zh-CN",
        prompt: null,
        stt_profile_name: null,
      };
  await page.route(/.*\/api\/speech\/config$/, async (route) => {
    await route.fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function waitForVoiceState(page: Page, expectedState: string): Promise<void> {
  await page.waitForFunction(
    (state) =>
      document.querySelector<HTMLButtonElement>("#voice-input-btn")?.dataset
        .voiceState === state,
    expectedState,
    { timeout: WAIT_TIMEOUT_MS },
  );
}

async function readVoiceRuntime(page: Page): Promise<VoiceRuntimeResult> {
  return page.evaluate<VoiceRuntimeResult>(() => {
    const voiceWindow = window as unknown as VoiceProbeWindow;
    return {
      active: voiceWindow.__relayTeamsVoiceInputActive === true,
      sent: voiceWindow.__voiceProbe.sent,
      state:
        document.querySelector<HTMLButtonElement>("#voice-input-btn")?.dataset
          .voiceState ?? "",
    };
  });
}

function voiceAudioProbeScript(
  options: {
    backpressured?: boolean;
    closeOnStop?: boolean;
    readyDelayMs?: number;
    sampleRate?: number;
  } = {},
): string {
  const bufferedAmount = options.backpressured === true ? "3000000" : "0";
  const closeOnStop = options.closeOnStop === false ? "false" : "true";
  const readyDelayMs = String(options.readyDelayMs ?? 20);
  const sampleRate = String(options.sampleRate ?? 16000);
  return `
(() => {
  window.AudioWorkletNode = undefined;
  window.__voiceProbe = { sent: [], closed: 0 };
  navigator.mediaDevices = navigator.mediaDevices || {};
  navigator.mediaDevices.getUserMedia = async () => ({
    getTracks: () => [{ stop() {}, readyState: "live", kind: "audio" }],
    getAudioTracks: () => [{ stop() {}, readyState: "live", kind: "audio" }],
  });

  class FakeAudioContext {
    constructor() {
      this.sampleRate = 48000;
      this.state = "running";
      this.destination = {};
      this.audioWorklet = null;
    }

    addEventListener() {}
    createMediaStreamSource() {
      return {
        connect(target) {
          target.__sourceConnected = true;
          return target;
        },
        disconnect() {},
      };
    }
    createScriptProcessor() {
      const processor = {
        onaudioprocess: null,
        __interval: null,
        __frameIndex: 0,
        connect() {
          if (this.__interval) return;
          this.__interval = window.setInterval(() => {
            const frame = this.__frameIndex;
            this.__frameIndex += 1;
            const samples = new Float32Array(4096);
            const amplitude = frame < 10 ? 0.18 : 0;
            for (let index = 0; index < samples.length; index += 1) {
              samples[index] = amplitude * Math.sin(index / 8);
            }
            this.onaudioprocess?.({
              inputBuffer: {
                getChannelData() {
                  return samples;
                },
              },
            });
          }, 80);
        },
        disconnect() {
          if (this.__interval) {
            window.clearInterval(this.__interval);
            this.__interval = null;
          }
        },
      };
      return processor;
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }

  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;

  class FakeSocket extends EventTarget {
    constructor() {
      super();
      this.readyState = 0;
      this.bufferedAmount = ${bufferedAmount};
      window.setTimeout(() => {
        this.readyState = 1;
        this._emit("open", new Event("open"));
        window.setTimeout(() => {
          this._message({ type: "status", status: "ready", sample_rate: ${sampleRate} });
        }, ${readyDelayMs});
      }, 20);
    }

    send(data) {
      const value = typeof data === "string"
        ? data
        : \`bytes:\${data.byteLength || data.size || 0}\`;
      window.__voiceProbe.sent.push(value);
      if (typeof data === "string" && data.includes("stop") && ${closeOnStop}) {
        window.setTimeout(() => this.close(), 20);
      }
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      window.__voiceProbe.closed += 1;
      this._emit("close", new CloseEvent("close"));
    }
    _message(payload) {
      if (this.readyState !== 1) return;
      this._emit("message", new MessageEvent("message", {
        data: JSON.stringify(payload),
      }));
    }
    _emit(type, event) {
      this.dispatchEvent(event);
      const handler = this[\`on\${type}\`];
      if (typeof handler === "function") {
        handler.call(this, event);
      }
    }
  }

  window.WebSocket = function WebSocket(url) {
    if (String(url).includes("/api/speech/stt/stream")) {
      return new FakeSocket();
    }
    throw new Error(\`Unexpected WebSocket URL: \${url}\`);
  };
  window.WebSocket.CONNECTING = 0;
  window.WebSocket.OPEN = 1;
  window.WebSocket.CLOSING = 2;
  window.WebSocket.CLOSED = 3;
})();
`;
}

function composerActionLayoutProbeScript(newSession: boolean): string {
  return `
(() => {
  const container = document.querySelector("#input-container");
  const wrapper = document.querySelector(".input-wrapper");
  const prompt = document.querySelector("#prompt-input");
  const actions = document.querySelector(".composer-actions");
  const controls = {
    resume: document.querySelector("#resume-run-btn"),
    stop: document.querySelector("#stop-btn"),
    voice: document.querySelector("#voice-input-btn"),
    send: document.querySelector("#send-btn"),
  };
  container.classList.toggle("is-new-session-draft-composer", ${newSession});
  prompt.value = "voice layout regression probe";
  prompt.dispatchEvent(new Event("input", { bubbles: true }));

  const scenarios = [
    { name: "send", visible: ["send"] },
    { name: "send-voice", visible: ["send", "voice"] },
    { name: "send-voice-stop", visible: ["send", "voice", "stop"] },
    { name: "send-voice-resume", visible: ["send", "voice", "resume"] },
    { name: "send-voice-stop-resume", visible: ["send", "voice", "stop", "resume"] },
  ];

  const setVisible = (element, visible) => {
    element.hidden = false;
    element.disabled = false;
    element.style.visibility = "visible";
    element.style.display = visible ? "inline-flex" : "none";
  };
  const rectFor = (name, element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const visible = style.display !== "none"
      && style.visibility !== "hidden"
      && rect.width > 0
      && rect.height > 0;
    return {
      name,
      visible,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  };
  const overlaps = (first, second) => {
    if (!first.visible || !second.visible) return false;
    return first.left < second.right - 0.5
      && first.right > second.left + 0.5
      && first.top < second.bottom - 0.5
      && first.bottom > second.top + 0.5;
  };

  return scenarios.map((scenario) => {
    Object.entries(controls).forEach(([name, element]) => {
      setVisible(element, scenario.visible.includes(name));
    });
    const actionRect = actions.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const promptStyle = getComputedStyle(prompt);
    const rects = Object.entries(controls).map(([name, element]) => rectFor(name, element));
    const visibleRects = rects.filter((rect) => rect.visible);
    const collisions = [];
    for (let firstIndex = 0; firstIndex < visibleRects.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < visibleRects.length; secondIndex += 1) {
        if (overlaps(visibleRects[firstIndex], visibleRects[secondIndex])) {
          collisions.push(\`\${visibleRects[firstIndex].name}/\${visibleRects[secondIndex].name}\`);
        }
      }
    }
    return {
      name: scenario.name,
      rects,
      collisions,
      railWidth: actionRect.width,
      wrapperWidth: wrapperRect.width,
      promptPaddingRight: Number.parseFloat(promptStyle.paddingRight),
      railFitsPromptPadding: Number.parseFloat(promptStyle.paddingRight) >= actionRect.width + 14,
      railInsideWrapper: actionRect.left >= wrapperRect.left
        && actionRect.right <= wrapperRect.right
        && actionRect.top >= wrapperRect.top
        && actionRect.bottom <= wrapperRect.bottom,
    };
  });
})()
`;
}

function assertComposerActionLayout(result: ComposerLayoutScenario[]): void {
  expect(result.length).toBeGreaterThan(0);
  for (const scenario of result) {
    expect(scenario.collisions, scenario.name).toEqual([]);
    expect(scenario.railFitsPromptPadding, scenario.name).toBe(true);
    expect(scenario.railInsideWrapper, scenario.name).toBe(true);
  }
}

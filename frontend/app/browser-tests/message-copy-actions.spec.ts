import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test, type Page } from "@playwright/test";

import { serveFrontendDist } from "./support/frontend-app";

const WAIT_TIMEOUT_MS = 10_000;

interface LastAnswerCopyPayload {
  buttonCount: number;
  buttonMessageId: string;
  copiedText: string;
  oldAnswerButtonCount: number;
  userButtonCount: number;
}

interface StableCopyPayload {
  finalCount: number;
  finalOwner: string;
  liveCount: number;
  liveOwner: string;
  stableCount: number;
}

interface DetachedHistoryPayload {
  afterMount: number;
  beforeMount: number;
  owner: string;
}

interface IntentCopyPayload {
  bodyButtonLabel: string;
  copiedText: string[];
  openAfterSummaryButtonKeydown: boolean;
  openAfterSummaryCopy: boolean;
  summaryButtonClass: string;
  summaryButtonKeydownCanceled: boolean;
}

interface RoundIntentPayload {
  closedAfterPatch: boolean;
  closedBeforePatch: boolean;
  openAfterPatch: boolean;
  openedBeforePatch: boolean;
  overflow: string;
  toggleHit: boolean;
}

interface RoundScrollPayload {
  afterRunId: string;
  afterTop: number;
  beforeRunId: string;
  beforeTop: number;
  sessionLoadNearBottom: boolean;
  sessionLoadTop: number;
}

test("last answer copy button copies only the latest answer", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openMessageCopyHarness(page, appServer.url);

    const payload = await page.evaluate<LastAnswerCopyPayload>(() => {
      const harnessWindow = window as unknown as Window &
        MessageCopyHarnessWindow;
      harnessWindow.__runMessageCopySync();
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".message-copy-btn"),
      );
      buttons[0]?.click();
      return new Promise<LastAnswerCopyPayload>((resolve) => {
        window.setTimeout(() => {
          resolve({
            buttonCount: buttons.length,
            buttonMessageId:
              buttons[0]?.closest<HTMLElement>(".message")?.id ?? "",
            copiedText: harnessWindow.__copiedText[0] ?? "",
            oldAnswerButtonCount: document.querySelectorAll(
              "#old-answer .message-copy-btn",
            ).length,
            userButtonCount: document.querySelectorAll(
              "#user-message .message-copy-btn",
            ).length,
          });
        }, 0);
      });
    });

    expect(payload).toEqual({
      buttonCount: 1,
      buttonMessageId: "latest-answer",
      copiedText: 'Latest answer\n\nif ok:\n    print("yes")',
      oldAnswerButtonCount: 0,
      userButtonCount: 0,
    });
  } finally {
    await appServer.close();
  }
});

test("copy button waits until the latest answer is stable", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openMessageCopyHarness(page, appServer.url);

    const payload = await page.evaluate<StableCopyPayload>(() => {
      const harnessWindow = window as unknown as Window &
        MessageCopyHarnessWindow;
      harnessWindow.__runMessageCopySync();
      const stableCount =
        document.querySelectorAll(".message-copy-btn").length;
      const liveMessage = document.createElement("article");
      liveMessage.className = "message";
      liveMessage.dataset.role = "model";
      liveMessage.id = "live-answer";
      liveMessage.innerHTML = `
        <div class="msg-header"><span class="msg-role role-agent">AGENT</span></div>
        <div class="msg-content">
          <div class="msg-text">Streaming answer<span class="streaming-cursor"></span></div>
        </div>
      `;
      document.getElementById("chat-messages")?.appendChild(liveMessage);
      harnessWindow.__runMessageCopySync();
      const liveCount = document.querySelectorAll(".message-copy-btn").length;
      const liveOwner =
        document.querySelector(".message-copy-btn")?.closest<HTMLElement>(
          ".message",
        )?.id ?? "";
      liveMessage.querySelector(".streaming-cursor")?.remove();
      harnessWindow.__runMessageCopySync();
      const finalButton = document.querySelector(".message-copy-btn");
      return {
        finalCount: document.querySelectorAll(".message-copy-btn").length,
        finalOwner: finalButton?.closest<HTMLElement>(".message")?.id ?? "",
        liveCount,
        liveOwner,
        stableCount,
      };
    });

    expect(payload).toEqual({
      finalCount: 1,
      finalOwner: "live-answer",
      liveCount: 0,
      liveOwner: "",
      stableCount: 1,
    });
  } finally {
    await appServer.close();
  }
});

test("copy button syncs after detached history mount", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openMessageCopyHarness(page, appServer.url);

    const payload = await page.evaluate<DetachedHistoryPayload>(() => {
      const harnessWindow = window as unknown as Window &
        MessageCopyHarnessWindow;
      const root = document.getElementById("chat-messages");
      root?.replaceChildren();
      const section = document.createElement("section");
      section.innerHTML = `
        <article class="message" data-role="model" id="detached-answer">
          <div class="msg-header"><span class="msg-role role-agent">AGENT</span></div>
          <div class="msg-content"><div class="msg-text">Mounted final answer</div></div>
        </article>
      `;
      harnessWindow.__syncMessageCopyTarget(section);
      const beforeMount = section.querySelectorAll(".message-copy-btn").length;
      root?.appendChild(section);
      harnessWindow.__runMessageCopySync();
      return {
        afterMount: root?.querySelectorAll(".message-copy-btn").length ?? 0,
        beforeMount,
        owner:
          root
            ?.querySelector(".message-copy-btn")
            ?.closest<HTMLElement>(".message")?.id ?? "",
      };
    });

    expect(payload).toEqual({
      afterMount: 1,
      beforeMount: 0,
      owner: "detached-answer",
    });
  } finally {
    await appServer.close();
  }
});

test("bound intent copy button copies prompt without toggling summary", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openMessageCopyHarness(page, appServer.url);

    const payload = await page.evaluate<IntentCopyPayload>(() => {
      const harnessWindow = window as unknown as Window &
        MessageCopyHarnessWindow;
      const detail = document.createElement("details");
      detail.open = true;
      const summary = document.createElement("summary");
      const summaryButton = document.createElement("button");
      summaryButton.className = "round-detail-intent-copy";
      summary.appendChild(summaryButton);
      const body = document.createElement("div");
      const bodyButton = document.createElement("button");
      bodyButton.className = "round-detail-intent-copy";
      body.appendChild(bodyButton);
      detail.append(summary, body);
      document.body.appendChild(detail);

      harnessWindow.__bindCopyButton(summaryButton, "first user intent");
      harnessWindow.__bindCopyButton(bodyButton, "second user intent");
      const keyEvent = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
      });
      const keyDispatchResult = summaryButton.dispatchEvent(keyEvent);
      const openAfterSummaryButtonKeydown = detail.open;
      summaryButton.click();
      return new Promise<IntentCopyPayload>((resolve) => {
        window.setTimeout(() => {
          const openAfterSummaryCopy = detail.open;
          bodyButton.click();
          window.setTimeout(() => {
            resolve({
              bodyButtonLabel: bodyButton.getAttribute("aria-label") ?? "",
              copiedText: harnessWindow.__copiedText.slice(-2),
              openAfterSummaryButtonKeydown,
              openAfterSummaryCopy,
              summaryButtonClass: summaryButton.className,
              summaryButtonKeydownCanceled:
                keyDispatchResult === false || keyEvent.defaultPrevented,
            });
          }, 0);
        }, 0);
      });
    });

    expect(["Copy", "复制"]).toContain(payload.bodyButtonLabel);
    expect(payload).toEqual({
      bodyButtonLabel: payload.bodyButtonLabel,
      copiedText: ["first user intent", "second user intent"],
      openAfterSummaryButtonKeydown: true,
      openAfterSummaryCopy: true,
      summaryButtonClass:
        "round-detail-intent-copy message-copy-btn is-copied",
      summaryButtonKeydownCanceled: false,
    });
  } finally {
    await appServer.close();
  }
});

test("round intent toggle survives streaming patch and overlap", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openRoundIntentHarness(page, appServer.url);

    const payload = await page.evaluate<RoundIntentPayload>(() => {
      const harnessWindow = window as unknown as Window &
        RoundIntentHarnessWindow;
      return harnessWindow.__runRoundIntentScenario();
    });

    expect(payload).toEqual({
      closedAfterPatch: true,
      closedBeforePatch: true,
      openAfterPatch: true,
      openedBeforePatch: true,
      overflow: "true",
      toggleHit: true,
    });
  } finally {
    await appServer.close();
  }
});

test("round timeline click rerender preserves scroll anchor", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openRoundIntentHarness(page, appServer.url);

    const payload = await page.evaluate<RoundScrollPayload>(() => {
      const harnessWindow = window as unknown as Window &
        RoundIntentHarnessWindow;
      return harnessWindow.__runRoundScrollAnchorScenario();
    });

    expect(payload.beforeRunId).toBe("run-scroll-middle");
    expect(payload.afterRunId).toBe("run-scroll-middle");
    expect(payload.beforeTop).toBeGreaterThan(120);
    expect(Math.abs(payload.afterTop - payload.beforeTop)).toBeLessThanOrEqual(
      12,
    );
    expect(payload.sessionLoadTop).toBeGreaterThan(payload.afterTop);
    expect(payload.sessionLoadNearBottom).toBe(true);
  } finally {
    await appServer.close();
  }
});

async function openMessageCopyHarness(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/message-copy-actions.html`);
  await page.waitForFunction(
    () =>
      (window as unknown as Window & MessageCopyHarnessWindow)
        .__messageCopyReady === true,
    undefined,
    { timeout: WAIT_TIMEOUT_MS },
  );
}

async function openRoundIntentHarness(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/round-intent-controls.html`);
  await page.waitForFunction(
    () =>
      (window as unknown as Window & RoundIntentHarnessWindow)
        .__roundIntentReady === true,
    undefined,
    { timeout: WAIT_TIMEOUT_MS },
  );
}

function handleHarnessRequest(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/message-copy-actions.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(messageCopyHarnessHtml());
    return true;
  }
  if (requestUrl.pathname === "/round-intent-controls.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(roundIntentHarnessHtml());
    return true;
  }
  return false;
}

function messageCopyHarnessHtml(): string {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>message copy actions harness</title>
</head>
<body>
  <main id="chat-messages">
    <article class="message" data-role="model" id="old-answer">
      <div class="msg-header"><span class="msg-role role-agent">AGENT</span></div>
      <div class="msg-content"><div class="msg-text"><p>Old answer</p></div></div>
    </article>
    <article class="message" data-role="user" id="user-message">
      <div class="msg-header"><span class="msg-role role-user">USER</span></div>
      <div class="msg-content"><div class="msg-text"><p>User prompt</p></div></div>
    </article>
    <article class="message" data-role="model" id="latest-answer">
      <div class="msg-header"><span class="msg-role role-agent">AGENT</span></div>
      <div class="msg-content">
        <div class="msg-text">
          <p>Latest <strong>answer</strong></p>
          <div class="markdown-code-block">
            <div class="markdown-code-header">
              <span class="markdown-code-language">Bash</span>
              <button class="markdown-code-copy" type="button">Copy</button>
            </div>
            <pre><code>if ok:
    print("yes")
</code></pre>
          </div>
          <details class="thinking-block"><summary>Thinking</summary><div>secret thought</div></details>
          <details class="tool-block"><summary>Tool</summary><div>tool output</div></details>
        </div>
      </div>
    </article>
  </main>
  <script>
    window.__copiedText = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async value => {
          window.__copiedText.push(String(value));
        },
      },
    });
  </script>
  <script type="module">
    import { bindCopyButton, syncLastAnswerCopyButton } from "/js/components/messageRenderer/messageActions.js";
    window.__bindCopyButton = bindCopyButton;
    window.__runMessageCopySync = () => syncLastAnswerCopyButton(document.getElementById("chat-messages"));
    window.__syncMessageCopyTarget = target => syncLastAnswerCopyButton(target);
    window.__messageCopyReady = true;
  </script>
</body>
</html>
`.trim();
}

function roundIntentHarnessHtml(): string {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>round intent controls harness</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    body {
      margin: 0;
      width: 1280px;
      height: 900px;
    }
    .chat-container {
      height: 720px;
    }
    #chat-messages {
      height: 640px;
      overflow-y: auto;
      padding: 24px 120px;
    }
    .intent-overlap-probe {
      height: 56px;
      margin-top: -42px;
      background: rgba(239, 68, 68, 0.18);
    }
    .session-round-section {
      min-height: 520px;
    }
  </style>
</head>
<body class="light-theme">
  <div class="chat-container">
    <main id="chat-messages" class="chat-scroll"></main>
    <div id="input-container"></div>
  </div>
  <div id="round-nav-float"></div>
  <script>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  </script>
  <script type="module">
    import {
      createLiveRound,
      overlayRoundRecoveryState,
      renderCurrentSessionTimeline,
    } from "/js/components/rounds/timeline.js";
    import { state } from "/js/core/state.js";

    state.currentSessionId = "round-intent-harness";

    const waitForLayout = () => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const waitForRoundScrollAnimation = () => new Promise(resolve => {
      window.setTimeout(resolve, 900);
    });

    window.__runRoundIntentScenario = async () => {
      const longIntent = [
        "请检查这个项目里 Skill 机制是怎么实现的，并总结入口、注册流程和运行时调用链。",
        "重点看 src/relay_teams/skills 和 interfaces/server 相关路由。",
        "最后给出一个简洁但完整的实现说明。"
      ].join("\\n");
      createLiveRound("run-intent-controls", longIntent);
      await waitForLayout();

      const detail = document.querySelector(".round-detail-intent");
      const summary = detail?.querySelector(".round-detail-intent-summary");
      summary?.click();
      await waitForLayout();
      const openedBeforePatch = detail?.open === true;

      overlayRoundRecoveryState("run-intent-controls", {
        run_phase: "running",
        pending_tool_approval_count: 1,
      });
      await waitForLayout();
      const openAfterPatch = detail?.open === true;

      detail?.querySelector(".round-detail-intent-collapse")?.click();
      await waitForLayout();
      const closedBeforePatch = detail?.open === false;

      overlayRoundRecoveryState("run-intent-controls", {
        run_phase: "running",
        pending_tool_approval_count: 0,
      });
      await waitForLayout();
      const closedAfterPatch = detail?.open === false;

      const header = document.querySelector(".round-detail-header");
      const overlap = document.createElement("div");
      overlap.className = "message intent-overlap-probe";
      overlap.textContent = "streaming overlap probe";
      header?.after(overlap);
      await waitForLayout();

      const toggle = detail?.querySelector(".round-detail-intent-toggle");
      const rect = toggle?.getBoundingClientRect();
      const hit = rect
        ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        : null;

      return {
        closedAfterPatch,
        closedBeforePatch,
        openAfterPatch,
        openedBeforePatch,
        overflow: detail?.dataset.overflow || "",
        toggleHit: hit === toggle || toggle?.contains(hit) === true,
      };
    };

    function firstVisibleRoundId() {
      const container = document.getElementById("chat-messages");
      const containerRect = container.getBoundingClientRect();
      const sections = Array.from(document.querySelectorAll(".session-round-section"));
      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
          return;
        }
        const distance = Math.abs(rect.top - containerRect.top);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = section;
        }
      });
      return best?.dataset?.runId || "";
    }

    window.__runRoundScrollAnchorScenario = async () => {
      const container = document.getElementById("chat-messages");
      const longIntent = [
        "Analyze the frontend round timeline scroll behavior and keep the visible section stable.",
        "This line gives the round enough height for meaningful anchor restoration.",
        "Clicking a message should not make the transcript jump to the top."
      ].join("\\n\\n");

      createLiveRound("run-scroll-oldest", longIntent);
      createLiveRound("run-scroll-middle", longIntent);
      createLiveRound("run-scroll-latest", longIntent);
      await waitForLayout();
      await waitForRoundScrollAnimation();

      const middleSection = document.querySelector('[data-run-id="run-scroll-middle"]');
      const middleTop = middleSection.getBoundingClientRect().top
        - container.getBoundingClientRect().top
        + container.scrollTop
        - 32;
      container.scrollTop = Math.max(0, middleTop);
      await waitForLayout();

      const message = middleSection.querySelector(".round-detail-header");
      message?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const beforeTop = container.scrollTop;
      const beforeRunId = firstVisibleRoundId();

      renderCurrentSessionTimeline({});
      await waitForLayout();
      const afterTop = container.scrollTop;
      const afterRunId = firstVisibleRoundId();

      renderCurrentSessionTimeline({ scrollPolicy: "session-load" });
      await waitForLayout();
      const sessionLoadTop = container.scrollTop;
      const sessionLoadNearBottom = (
        container.scrollHeight - container.scrollTop - container.clientHeight
      ) <= 12;

      return {
        afterRunId,
        afterTop,
        beforeRunId,
        beforeTop,
        sessionLoadNearBottom,
        sessionLoadTop,
      };
    };
    window.__roundIntentReady = true;
  </script>
</body>
</html>
`.trim();
}

interface MessageCopyHarnessWindow {
  __bindCopyButton: (button: HTMLButtonElement, text: string) => void;
  __copiedText: string[];
  __messageCopyReady: boolean;
  __runMessageCopySync: () => void;
  __syncMessageCopyTarget: (target: HTMLElement) => void;
}

interface RoundIntentHarnessWindow {
  __roundIntentReady: boolean;
  __runRoundIntentScenario: () => Promise<RoundIntentPayload>;
  __runRoundScrollAnchorScenario: () => Promise<RoundScrollPayload>;
}

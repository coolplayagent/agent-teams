import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionRound } from "../api/contracts";
import {
  buildMessagesHtml,
  buildMessagesJson,
  exportSessionMessages,
} from "../features/shell/messageExport";
import {
  messagePresentationGroups,
  presentationRoundMessages,
  sessionRoundMessageToTimelineMessage,
  timelineMessagePresentationParts,
} from "../features/timeline/messagePresentation";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("messageExport", () => {
  it("downloads a versioned, machine-readable JSON transcript", async () => {
    const createObjectUrl = mockDownloadUrl();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await exportSessionMessages({
      format: "json",
      rounds: [{ intent: "Review export", run_id: "run-1" }],
      sessionId: "session-1",
    });

    const blob = firstCreatedBlob(createObjectUrl);
    expect(blob.type).toBe("application/json;charset=utf-8");
    const transcript = JSON.parse(buildMessagesJson(
      "session-1",
      [{ intent: "Review export", run_id: "run-1" }],
      "2026-07-12T00:00:00Z",
    ));
    expect(transcript).toMatchObject({
      schema: "relay-teams.session-transcript",
      sessionId: "session-1",
      version: 3,
    });
    expect(transcript.entries).toEqual([
      expect.objectContaining({ kind: "user", text: "Review export" }),
    ]);
    expect(transcript.entries[0]?.label).toBe("");
  });

  it("builds escaped standalone HTML from complete round projections", async () => {
    const html = await buildMessagesHtml("session/<one>", [
      {
        coordinator_messages: [
          {
            message: {
              parts: [
                { part_kind: "text", content: "First part" },
                {
                  args: { cmd: "npm test" },
                  part_kind: "tool-call",
                  tool_call_id: "tool-1",
                  tool_name: "execute_command",
                },
                {
                  content: "<script>alert(1)</script>",
                  part_kind: "tool-return",
                  tool_call_id: "tool-1",
                  tool_name: "execute_command",
                },
              ],
            },
            role_id: "Writer",
          },
        ],
        created_at: "2026-06-23T01:00:00Z",
        has_final_output: true,
        injection_messages: [
          {
            applied_at: "2026-06-23T01:00:01Z",
            content: "Injected note",
          },
        ],
        intent_parts: [{ kind: "text", text: "User prompt" }],
        run_id: "run-1",
        run_phase: "completed",
        run_status: "completed",
      },
    ]);

    expect(html).toContain("session/&lt;one&gt;");
    expect(html).toContain("data-kind=\"user\"");
    expect(html).toContain("User prompt");
    expect(html).toContain("Writer");
    expect(html).toContain("First part");
    expect(html).toContain("data-kind=\"tool\"");
    expect(html).toContain("execute_command");
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelector("details.at-message-tool summary")?.textContent)
      .toContain("execute_command");
    expect(document.querySelector("details.at-message-tool .at-tool-details")?.textContent)
      .toContain("npm test");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Inserted message");
    expect(html).toContain("Injected note");
    expect(html).toContain("<!doctype html>");
    expect(html).not.toContain("relay-teams.session-transcript");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("&quot;cmd&quot;");
  });

  it("exports a localized, human-first transcript instead of a JSON dump", async () => {
    const html = await buildMessagesHtml("会话一", [{
      coordinator_messages: [{
        created_at: "2026-07-14T01:00:01Z",
        message: { parts: [
          { content: "I should inspect the current state.", part_kind: "thinking" },
          {
            args: { path: "frontend/app", recursive: true },
            part_kind: "tool-call",
            tool_call_id: "call-1",
            tool_name: "read",
          },
          {
            content: { count: 2, files: ["Composer.tsx", "messageExport.ts"] },
            part_kind: "tool-return",
            tool_call_id: "call-1",
            tool_name: "read",
          },
          {
            content: "## 结果\n\n| 文件 | 状态 |\n| --- | --- |\n| Composer.tsx | 正常 |",
            part_kind: "text",
          },
        ] },
        role: "assistant",
      }],
      intent: "检查导出",
      run_id: "run-1",
      run_phase: "completed",
      run_status: "completed",
    }], "zh-CN");

    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.querySelector(".at-message-transcript-eyebrow")?.textContent).toBe("会话记录");
    expect(document.querySelector(".at-message-transcript-entry[data-kind='user'] .at-message-transcript-entry-label")?.textContent)
      .toBe("用户");
    expect(document.querySelectorAll("details.at-message-tool[data-export-block='tool']"))
      .toHaveLength(1);
    expect(document.querySelector("details.at-message-tool[data-export-block='tool']")
      ?.hasAttribute("open")).toBe(false);
    expect(document.querySelector("details.at-message-thinking")?.hasAttribute("open"))
      .toBe(false);
    expect(document.querySelector("details.at-message-tool")?.textContent).toContain("已完成: read");
    expect(document.querySelector("details.at-message-tool")?.textContent).toContain("Composer.tsx");
    expect(document.querySelector(".at-message-transcript-entry[data-kind='assistant'] table")?.textContent)
      .toContain("正常");
    expect(document.querySelector(".routine-status")).toBeNull();
    expect(html).not.toContain("relay-teams.session-transcript");
    expect(html).not.toContain("&quot;recursive&quot;");
    const visibleLabels = Array.from(document.querySelectorAll(".at-message-transcript-entry-label"))
      .map((element) => element.textContent);
    expect(visibleLabels).toContain("用户");
    expect(visibleLabels).toContain("思考");
    expect(visibleLabels).toContain("工具调用");
    expect(visibleLabels).not.toContain("User");
    expect(visibleLabels).not.toContain("Thinking");
  });

  it("keeps one shared tool card when call and return are separated by visible output", async () => {
    const html = await buildMessagesHtml("session-interleaved-tool", [{
      coordinator_messages: [{
        message: { parts: [
          {
            args: { path: "frontend/app" },
            part_kind: "tool-call",
            tool_call_id: "call-interleaved",
            tool_name: "read",
          },
          { content: "The read is still in progress.", part_kind: "text" },
          {
            content: { files: ["MessageTimeline.tsx"] },
            part_kind: "tool-return",
            tool_call_id: "call-interleaved",
            tool_name: "read",
          },
        ] },
        role: "assistant",
      }],
      run_id: "run-interleaved-tool",
    }]);

    const document = new DOMParser().parseFromString(html, "text/html");
    const toolCards = document.querySelectorAll(
      "details.at-message-tool[data-tool-call-id='call-interleaved']",
    );
    expect(toolCards).toHaveLength(1);
    expect(toolCards[0]?.textContent).toContain("frontend/app");
    expect(toolCards[0]?.textContent).toContain("MessageTimeline.tsx");
    expect(document.body.textContent).toContain("The read is still in progress.");
  });

  it("keeps online presentation groups and exported HTML visibility aligned", async () => {
    const round: SessionRound = {
      coordinator_messages: [
        {
          content: "Internal routing details",
          visibility: "internal",
        },
        {
          instance_id: "main-1",
          message: {
            parts: [
              { content: "Inspect before answering.", part_kind: "thinking" },
              {
                args: { path: "frontend/app" },
                part_kind: "tool-call",
                tool_call_id: "call-1",
                tool_name: "read",
              },
              {
                content: { files: ["MessageTimeline.tsx"] },
                part_kind: "tool-return",
                tool_call_id: "call-1",
                tool_name: "read",
              },
              { content: "## Result\n\nReadable answer", part_kind: "text" },
              {
                mime_type: "image/png",
                modality: "image",
                name: "result.png",
                part_kind: "media_ref",
                url: "https://example.test/result.png",
              },
            ],
          },
          role: "assistant",
        },
      ],
      injection_messages: [{ content: "Inserted follow-up" }],
      intent: "Inspect export parity",
      primary_instance_id: "main-1",
      run_id: "run-parity",
      run_phase: "completed",
      run_status: "completed",
    };
    const onlineGroups = presentationRoundMessages(round).flatMap(({ message }) =>
      messagePresentationGroups(
        timelineMessagePresentationParts(
          sessionRoundMessageToTimelineMessage(message, round.run_id),
        ),
      ).map((group) => group.kind),
    );

    const document = new DOMParser().parseFromString(
      await buildMessagesHtml("session-parity", [round]),
      "text/html",
    );
    const exportedGroups = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".at-message-transcript-round > .at-message-transcript-entry[data-kind]",
      ),
    ).flatMap((element) => {
      const kind = element.dataset.kind ?? "";
      if (["injection", "status", "user"].includes(kind)) return [];
      if (["thinking", "tool"].includes(kind)) return [kind];
      return Array.from(
        element.querySelectorAll<HTMLElement>(".at-message-content > [data-export-block]"),
      ).map(() => "content");
    });

    expect(onlineGroups).toEqual(["thinking", "tool", "content", "content"]);
    expect(exportedGroups).toEqual(onlineGroups);
    expect(document.body.textContent).not.toContain("Internal routing details");
    expect(document.querySelector("article[data-kind='assistant'] h2")?.textContent)
      .toBe("Result");
    expect(document.querySelector("article[data-kind='assistant'] img")?.getAttribute("src"))
      .toBe("https://example.test/result.png");
  });

  it("keeps shared semantic fields free of export copy and localizes zh-CN adapters", async () => {
    const rounds: SessionRound[] = [{
      injection_messages: [{
        content_parts: [
          { kind: "text", text: "请查看附件" },
          {
            asset_id: "asset-zh",
            kind: "media_ref",
            modality: "image",
            name: "结果.png",
          },
        ],
        sender_instance_id: "worker-1",
      }],
      instance_role_map: { "main-1": "MainAgent", "worker-1": "Worker" },
      pending_tool_approval_count: 1,
      primary_instance_id: "main-1",
      retry_events: [{ kind: "retry", phase: "scheduled" }],
      run_id: "run-zh",
      run_phase: "waiting",
      run_status: "running",
    }];
    const transcript = JSON.parse(buildMessagesJson("session-zh", rounds)) as {
      entries: Array<{ label: string; parts: Array<{ kind: string }> }>;
    };
    const html = await buildMessagesHtml("session-zh", rounds, "zh-CN");

    expect(transcript.entries.every((entry) => entry.label === "")).toBe(true);
    expect(transcript.entries.flatMap((entry) => entry.parts).map((part) => part.kind))
      .toEqual(["text", "media", "status", "status"]);
    expect(html).toContain("子代理 · 插入消息");
    expect(html).toContain("附件");
    expect(html).toContain("结果.png");
    expect(html).toContain("重试 1");
    expect(html).toContain("running / waiting");
    expect(html).toContain("scheduled");
    expect(html).not.toContain("Subagent injection");
    expect(html).not.toContain("Pending approvals");
    expect(html).not.toContain("Retry 1");
  });

  it("renders readable Markdown and escaped code without executable markup", async () => {
    const html = await buildMessagesHtml("session-1", [{
      coordinator_messages: [{
        message: { parts: [{
          content: "**Result**\n\n- one\n- two\n\n```html\n<img src=x onerror=alert(1)>\n```",
          part_kind: "text",
        }] },
        role: "assistant",
      }],
      run_id: "run-1",
    }]);

    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelector(".at-message-transcript-entry[data-kind='assistant'] strong")?.textContent).toBe("Result");
    expect(document.querySelectorAll(".at-message-transcript-entry li")).toHaveLength(2);
    expect(document.querySelector("pre code")?.textContent).toContain("<img src=x");
    expect(document.querySelector("img")).toBeNull();
  });

  it("preserves user text that resembles an internal code-block marker", async () => {
    const html = await buildMessagesHtml("session-1", [{
      coordinator_messages: [{
        message: { parts: [{
          content: "MESSAGE_EXPORT_CODE_BLOCK_0\n\n```text\nactual code\n```",
          part_kind: "text",
        }] },
        role: "assistant",
      }],
      run_id: "run-1",
    }]);

    const document = new DOMParser().parseFromString(html, "text/html");
    const content = document.querySelector(".at-message-transcript-entry[data-kind='assistant'] .at-message-content");
    expect(content?.querySelector("p")?.textContent).toBe(
      "MESSAGE_EXPORT_CODE_BLOCK_0",
    );
    expect(content?.querySelector("pre code")?.textContent?.trim()).toBe("actual code");
    expect(content?.querySelectorAll("pre code")).toHaveLength(1);
  });

  it("exports coordinator messages that store content on the nested message object", async () => {
    const html = await buildMessagesHtml("session-1", [
      {
        coordinator_messages: [
          {
            message: {
              content: "Nested final output",
            },
            role_id: "MainAgent",
          },
        ],
        run_id: "run-1",
      },
    ]);

    expect(html).toContain("MainAgent");
    expect(html).toContain("Nested final output");
  });

  it("exports media-only prompt parts as readable references", async () => {
    const html = await buildMessagesHtml("session-1", [
      {
        intent_parts: [
          {
            asset_id: "asset-1",
            kind: "media_ref",
            mime_type: "image/png",
            modality: "image",
            name: "screenshot.png",
            url: "https://example.test/assets/asset-1",
          },
        ],
        run_id: "run-1",
      },
    ]);

    expect(html).toContain("data-kind=\"user\"");
    const document = new DOMParser().parseFromString(html, "text/html");
    const image = document.querySelector<HTMLImageElement>("figure.at-message-media img");
    expect(image?.alt).toBe("screenshot.png");
    expect(image?.getAttribute("src")).toBe("https://example.test/assets/asset-1");
    expect(document.querySelector("figure.at-message-media figcaption")?.textContent)
      .toBe("screenshot.png");
  });

  it("embeds same-origin media so file exports remain readable offline", async () => {
    const fetchMedia = vi.fn().mockResolvedValue({
      blob: async () => new Blob(["image-bytes"], { type: "image/png" }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMedia);
    const html = await buildMessagesHtml("session-offline-media", [{
      intent_parts: [
        {
          asset_id: "asset-offline",
          kind: "media_ref",
          mime_type: "image/png",
          modality: "image",
          name: "offline.png",
          url: "/api/assets/offline.png",
        },
        {
          asset_id: "asset-absolute",
          kind: "media_ref",
          mime_type: "image/png",
          modality: "image",
          name: "absolute.png",
          url: `${window.location.origin}/api/assets/absolute.png`,
        },
      ],
      run_id: "run-offline-media",
    }]);

    const document = new DOMParser().parseFromString(html, "text/html");
    expect(fetchMedia).toHaveBeenCalledWith("/api/assets/offline.png");
    expect(fetchMedia).toHaveBeenCalledWith(
      `${window.location.origin}/api/assets/absolute.png`,
    );
    expect(Array.from(document.querySelectorAll<HTMLImageElement>("img"))
      .map((image) => image.getAttribute("src")))
      .toEqual([
        "data:image/png;base64,aW1hZ2UtYnl0ZXM=",
        "data:image/png;base64,aW1hZ2UtYnl0ZXM=",
      ]);
  });

  it("exports inline, url, and binary prompt media parts", async () => {
    const html = await buildMessagesHtml("session-1", [
      {
        intent: "Describe these files",
        intent_parts: [
          { kind: "text", text: "Describe these files" },
          {
            base64_data: "QUJD",
            kind: "inline_media",
            mime_type: "image/png",
            modality: "image",
            name: "inline.png",
          },
          {
            kind: "image-url",
            media_type: "image/jpeg",
            name: "remote.jpg",
            url: "https://example.test/remote.jpg",
          },
          {
            data: "UklGRg==",
            kind: "binary",
            media_type: "audio/wav",
            name: "voice.wav",
          },
        ],
        run_id: "run-1",
      },
    ]);

    expect(html).toContain("Describe these files");
    const document = new DOMParser().parseFromString(html, "text/html");
    const images = Array.from(document.querySelectorAll<HTMLImageElement>("figure.at-message-media img"));
    expect(images.map((image) => [image.alt, image.getAttribute("src")])).toEqual([
      ["inline.png", "data:image/png;base64,QUJD"],
      ["remote.jpg", "https://example.test/remote.jpg"],
    ]);
    expect(document.querySelector<HTMLAnchorElement>("a.at-message-media-link")?.getAttribute("href"))
      .toBe("data:audio/wav;base64,UklGRg==");
  });

  it("does not make unsafe attachment URLs interactive", async () => {
    const html = await buildMessagesHtml("session-1", [{
      intent_parts: [{
        kind: "audio-url",
        media_type: "audio/mpeg",
        name: "unsafe.mp3",
        url: "javascript:alert(1)",
      }],
      run_id: "run-1",
    }]);
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector("a[href^='javascript:']")).toBeNull();
    expect(document.querySelector(".at-message-content")?.textContent).toContain("unsafe.mp3");
  });

  it("exports mixed text and media injection parts", async () => {
    const html = await buildMessagesHtml("session-1", [
      {
        injection_messages: [
          {
            content_parts: [
              { kind: "text", text: "Inspect this output" },
              {
                asset_id: "asset-2",
                kind: "media_ref",
                modality: "image",
                name: "render.png",
              },
            ],
            sender_instance_id: "worker-1",
            sender_role_id: "Worker",
          },
        ],
        instance_role_map: { "main-1": "Main Agent", "worker-1": "Worker" },
        primary_instance_id: "main-1",
        run_id: "run-1",
      },
    ]);

    expect(html).toContain("Subagent · Inserted message");
    expect(html).toContain("Inspect this output");
    expect(html).toContain("render.png");
  });

  it("keeps inserted messages between the surrounding assistant output in HTML", async () => {
    const html = await buildMessagesHtml("session-1", [{
      coordinator_messages: [
        {
          content: "Before insertion",
          created_at: "2026-07-11T00:00:01Z",
          instance_id: "main-1",
          role: "assistant",
        },
        {
          content: "After insertion",
          created_at: "2026-07-11T00:00:03Z",
          instance_id: "main-1",
          role: "assistant",
        },
      ],
      injection_messages: [{
        applied_at: "2026-07-11T00:00:02Z",
        content: "Inserted between messages",
      }],
      primary_instance_id: "main-1",
      run_id: "run-1",
    }]);

    expect(html.indexOf("Before insertion")).toBeLessThan(
      html.indexOf("Inserted between messages"),
    );
    expect(html.indexOf("Inserted between messages")).toBeLessThan(
      html.indexOf("After insertion"),
    );
    expect(html).toContain("data-kind=\"injection\"");
    expect(html).toContain("Inserted message");
  });

  it("exports main and subagent interactive tools without tool-name classification", async () => {
    const html = await buildMessagesHtml("session-1", [{
      coordinator_messages: [
        {
          created_at: "2026-07-11T00:00:01Z",
          instance_id: "main-1",
          message: { parts: [{
            action_family: "generic",
            args: { question: "Continue?" },
            part_kind: "tool-call",
            semantic_category: "interactive",
            tool_name: "ask_question",
          }] },
          role: "assistant",
        },
        {
          created_at: "2026-07-11T00:00:02Z",
          instance_id: "worker-1",
          message: { parts: [{
            action_family: "generic",
            args: { question: "Select a direction" },
            part_kind: "tool-call",
            semantic_category: "interactive",
            tool_name: "request_user_input",
          }] },
          role: "assistant",
        },
      ],
      instance_role_map: { "main-1": "Main Agent", "worker-1": "Worker" },
      primary_instance_id: "main-1",
      run_id: "run-1",
    }]);

    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll("article[data-kind='tool'] details.at-message-tool"))
      .toHaveLength(2);
    expect(document.querySelectorAll("article[data-kind='question']")).toHaveLength(0);
    expect(document.querySelector("article[data-actor='assistant'] details")?.textContent)
      .toContain("ask_question");
    expect(document.querySelector("article[data-actor='subagent'] details")?.textContent)
      .toContain("request_user_input");
  });

  it("exports round pending question and retry details", async () => {
    const html = await buildMessagesHtml("session-1", [
      {
        pending_tool_approval_count: 1,
        pending_user_question_count: 2,
        retry_events: [
          {
            attempt_number: 3,
            error_code: "rate_limit",
            error_message: "Try again later",
            is_active: true,
            kind: "retry",
            phase: "scheduled",
            retry_in_ms: 2500,
            total_attempts: 5,
          },
          {
            kind: "fallback",
            phase: "activated",
            to_profile_id: "secondary",
          },
        ],
        run_id: "run-1",
      },
    ]);

    expect(html).toContain("data-kind=\"status\"");
    expect(html).toContain("Retry 1");
    expect(html).toContain("<dt>kind</dt><dd><code>retry</code></dd>");
    expect(html).toContain("<dt>phase</dt><dd><code>scheduled</code></dd>");
    expect(html).toContain("<dt>attempt_number</dt><dd><span>3</span></dd>");
    expect(html).toContain("<dt>retry_in_ms</dt><dd><span>2500</span></dd>");
    expect(html).toContain("<dt>error_code</dt><dd><code>rate_limit</code></dd>");
    expect(html).toContain("<dt>error_message</dt><dd><code>Try again later</code></dd>");
    expect(html).toContain("<dt>is_active</dt><dd><span>true</span></dd>");
    expect(html).toContain("<dt>total_attempts</dt><dd><span>5</span></dd>");
    expect(html).toContain("Retry 2");
    expect(html).toContain("<dt>kind</dt><dd><code>fallback</code></dd>");
    expect(html).toContain("<dt>to_profile_id</dt><dd><code>secondary</code></dd>");
  });

  it("downloads the HTML transcript", async () => {
    const createObjectUrl = mockDownloadUrl();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await exportSessionMessages({
      format: "html",
      rounds: [
        {
          coordinator_messages: [
            {
              message: { parts: [{ part_kind: "text", content: "Done" }] },
              role: "assistant",
            },
          ],
          run_id: "run-1",
        },
      ],
      sessionId: "session one",
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = firstCreatedBlob(createObjectUrl);
    expect(blob.type).toBe("text/html;charset=utf-8");
  });

  it("renders and downloads a PNG transcript through canvas", async () => {
    const { createObjectUrl, fillText, toBlob } = mockCanvasDownloads();

    await exportSessionMessages({
      format: "png",
      rounds: [
        {
          coordinator_messages: [
            {
              message: { parts: [{ part_kind: "text", content: "Rendered content" }] },
              role_id: "MainAgent",
            },
          ],
          run_id: "run-1",
        },
      ],
      sessionId: "session-1",
    });

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(firstCreatedBlob(createObjectUrl).type).toBe("image/png");
    expect(fillText).toHaveBeenCalledWith("session-1", expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith("MainAgent", expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith(
      "Rendered content",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("renders structured tool details in PNG instead of raw JSON", async () => {
    const { fillText } = mockCanvasDownloads();

    await exportSessionMessages({
      format: "png",
      rounds: [{
        coordinator_messages: [{
          message: { parts: [
            {
              args: { path: "frontend/app" },
              part_kind: "tool-call",
              tool_call_id: "call-1",
              tool_name: "read",
            },
            {
              content: { files: ["MessageTimeline.tsx"] },
              part_kind: "tool-return",
              tool_call_id: "call-1",
              tool_name: "read",
            },
          ] },
          role_id: "MainAgent",
        }],
        run_id: "run-1",
      }],
      sessionId: "session-1",
    });

    const renderedText = fillText.mock.calls.map(([text]) => text).join("\n");
    expect(renderedText).toContain("Tool call");
    expect(renderedText).toContain("frontend/app");
    expect(renderedText).toContain("MessageTimeline.tsx");
  });

  it("splits oversized PNG transcripts into multiple downloads", async () => {
    const { createObjectUrl, toBlob } = mockCanvasDownloads();
    const longContent = Array.from({ length: 700 }, (_, index) => `line ${index}`)
      .join("\n");

    const fileCount = await exportSessionMessages({
      format: "png",
      rounds: [
        {
          coordinator_messages: [
            {
              message: { parts: [{ part_kind: "text", content: longContent }] },
              role_id: "MainAgent",
            },
          ],
          run_id: "run-1",
        },
      ],
      sessionId: "session-1",
    });

    expect(fileCount).toBeGreaterThan(1);
    expect(toBlob).toHaveBeenCalledTimes(fileCount);
    expect(createObjectUrl).toHaveBeenCalledTimes(fileCount);
  });
});

function mockCanvasDownloads() {
  const createObjectUrl = mockDownloadUrl();
  const fillText = vi.fn();
  const context = fakeCanvasContext(fillText);
  const getCanvasContext = ((
    contextId: string,
  ): RenderingContext | null => {
    return contextId === "2d" ? context : null;
  }) as HTMLCanvasElement["getContext"];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    getCanvasContext,
  );
  const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
    callback(new Blob(["png"], { type: type ?? "image/png" }));
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: toBlob,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    () => undefined,
  );
  return { createObjectUrl, fillText, toBlob };
}

function mockDownloadUrl() {
  const createObjectUrl = vi.fn((_: Blob | MediaSource) => "blob:export");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  return createObjectUrl;
}

function firstCreatedBlob(createObjectUrl: ReturnType<typeof mockDownloadUrl>): Blob {
  const blob = createObjectUrl.mock.calls[0]?.[0];
  if (!(blob instanceof Blob)) {
    throw new Error("Expected export to create a Blob.");
  }
  return blob;
}

function fakeCanvasContext(
  fillText: (text: string, x: number, y: number) => void,
): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "",
    fillText,
    font: "",
    lineTo: vi.fn(),
    measureText: (value: string) => ({ width: value.length * 7 }) as TextMetrics,
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

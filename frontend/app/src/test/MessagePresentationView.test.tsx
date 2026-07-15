import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { translate, type Translate } from "../i18n";
import {
  buildMessageToolPresentationModel,
  MessagePresentationMedia,
  MessagePresentationView,
  type MessagePresentationLabels,
} from "../features/timeline/MessagePresentationView";

const t: Translate = (key, replacements) => translate("en", key, replacements);
const labels: MessagePresentationLabels = {
  attachment: "Attachment",
  error: "Error",
  mediaType: "Media type",
  retry: "Retry",
  status: "Status",
  timelineCall: "Tool call",
  timelineCompleted: "Completed",
  timelineInput: "Input",
  timelineOutput: "Output",
  timelineThinking: "Thinking",
  timelineValidation: "Validation failed",
  url: "URL",
};

describe("MessagePresentationView", () => {
  it("keeps same-origin API media visible in the live timeline renderer", () => {
    render(
      <MessagePresentationMedia
        media={{
          kind: "media",
          mimeType: "image/png",
          modality: "image",
          name: "workspace-result.png",
          url: "/api/workspaces/workspace-1/files/result.png",
        }}
        t={t}
      />,
    );

    expect(screen.getByRole("img", { name: "workspace-result.png" }))
      .toHaveAttribute("src", "/api/workspaces/workspace-1/files/result.png");
  });

  it("localizes the protocol media fallback before showing it to users", () => {
    render(
      <MessagePresentationMedia
        interactive={false}
        media={{
          kind: "media",
          mimeType: "image/png",
          modality: "media",
          name: "media",
          url: "/api/assets/fallback.png",
        }}
        t={t}
      />,
    );

    expect(screen.getByRole("img", { name: "Media" })).toBeInTheDocument();
  });

  it("uses the same tool title and preview semantics for timeline and transcript leaves", () => {
    const timelineModel = buildMessageToolPresentationModel({
      actionFamily: "read",
      body: "MessageTimeline.tsx",
      callId: "call-1",
      error: false,
      input: JSON.stringify({ path: "frontend/app" }, null, 2),
      output: "MessageTimeline.tsx",
      raw: "MessageTimeline.tsx",
      semanticCategory: "file-read",
      stage: "return",
      t,
      toolName: "read",
    });

    const { container } = render(
      <MessagePresentationView
        disclosurePrefix="export"
        interactive={false}
        labels={labels}
        parts={[
          {
            actionFamily: "read",
            callId: "call-1",
            error: false,
            kind: "tool",
            semanticCategory: "file-read",
            stage: "call",
            toolName: "read",
            value: { path: "frontend/app" },
          },
          {
            actionFamily: "read",
            callId: "call-1",
            error: false,
            kind: "tool",
            semanticCategory: "file-read",
            stage: "return",
            toolName: "read",
            value: { files: ["MessageTimeline.tsx"] },
          },
        ]}
        t={t}
      />,
    );

    expect(container.querySelector(".at-message-tool-title span:last-child")?.textContent)
      .toBe(timelineModel.title);
    expect(container.querySelector(".at-message-tool-preview")?.textContent)
      .toBe(timelineModel.preview);
  });
});

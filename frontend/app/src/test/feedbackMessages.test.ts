import { describe, expect, it, vi } from "vitest";

import {
  showFeedbackMessage,
  type FeedbackMessenger,
} from "../components/feedbackMessages";

function createMessenger(): FeedbackMessenger {
  return {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  };
}

describe("feedbackMessages", () => {
  it("suppresses repeated messages for the same dedupe key", () => {
    const messenger = createMessenger();
    const now = vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1100)
      .mockReturnValueOnce(4101);

    expect(showFeedbackMessage(messenger, "error", "Microphone failed", {
      dedupeKey: "voice-input-error:Microphone failed",
      dedupeMs: 3000,
      now,
    })).toBe(true);
    expect(showFeedbackMessage(messenger, "error", "Microphone failed", {
      dedupeKey: "voice-input-error:Microphone failed",
      dedupeMs: 3000,
      now,
    })).toBe(false);
    expect(showFeedbackMessage(messenger, "error", "Microphone failed", {
      dedupeKey: "voice-input-error:Microphone failed",
      dedupeMs: 3000,
      now,
    })).toBe(true);

    expect(messenger.error).toHaveBeenCalledTimes(2);
    expect(messenger.error).toHaveBeenNthCalledWith(1, "Microphone failed");
    expect(messenger.error).toHaveBeenNthCalledWith(2, "Microphone failed");
  });

  it("keeps different dedupe keys independent", () => {
    const messenger = createMessenger();
    const now = () => 1000;

    showFeedbackMessage(messenger, "warning", "First warning", {
      dedupeKey: "first",
      now,
    });
    showFeedbackMessage(messenger, "warning", "Second warning", {
      dedupeKey: "second",
      now,
    });

    expect(messenger.warning).toHaveBeenCalledTimes(2);
    expect(messenger.warning).toHaveBeenNthCalledWith(1, "First warning");
    expect(messenger.warning).toHaveBeenNthCalledWith(2, "Second warning");
  });

  it("does not dedupe messages without a key", () => {
    const messenger = createMessenger();

    showFeedbackMessage(messenger, "success", "Saved.");
    showFeedbackMessage(messenger, "success", "Saved.");

    expect(messenger.success).toHaveBeenCalledTimes(2);
  });
});

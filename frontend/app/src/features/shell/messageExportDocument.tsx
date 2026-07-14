import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import toolDetailsCss from "../timeline/ToolCallDetails.css?raw";
import transcriptCss from "../timeline/MessageTranscriptDocument.css?raw";
import themeCss from "../../styles/theme.css?raw";
import {
  type MessagePresentationPart,
  type MessageTranscript,
  type TranscriptRound,
} from "../timeline/messagePresentation";
import {
  MessageTranscriptDocument,
  messageTranscriptCopy,
} from "../timeline/MessageTranscriptDocument";

const OFFLINE_DOCUMENT_OVERRIDES = `
html, body { height: auto; min-height: 100%; overflow: auto; }
body { margin: 0; background: var(--at-bg); }
* { scrollbar-width: thin; scrollbar-color: var(--at-border-strong) transparent; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: var(--at-border-strong); background-clip: padding-box; }
`;

export async function buildMessageExportDocument(
  transcript: MessageTranscript,
  locale: string,
): Promise<string> {
  const offlineTranscript = await hydrateOfflineMedia(transcript);
  const container = document.createElement("div");
  const root = createRoot(container);
  let markup = "";
  try {
    flushSync(() => {
      root.render(
        <MessageTranscriptDocument locale={locale} transcript={offlineTranscript} />,
      );
    });
    markup = container.innerHTML;
  } finally {
    flushSync(() => root.unmount());
  }
  const copy = messageTranscriptCopy(locale);
  return `<!doctype html>
<html lang="${escapeDocumentHtml(locale)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeDocumentHtml(transcript.sessionId)} · ${escapeDocumentHtml(copy.conversation)}</title>
  <style>${themeCss}\n${toolDetailsCss}\n${transcriptCss}\n${OFFLINE_DOCUMENT_OVERRIDES}</style>
</head>
<body>${markup}</body>
</html>`;
}

async function hydrateOfflineMedia(
  transcript: MessageTranscript,
): Promise<MessageTranscript> {
  const hydrateMedia = createOfflineMediaHydrator();
  const rounds = await Promise.all(
    transcript.rounds.map(async (round): Promise<TranscriptRound> => ({
      ...round,
      entries: await Promise.all(round.entries.map(async (entry) => ({
        ...entry,
        parts: await Promise.all(entry.parts.map(hydrateMedia)),
      }))),
    })),
  );
  return {
    ...transcript,
    entries: rounds.flatMap((round) => round.entries),
    rounds,
  };
}

function createOfflineMediaHydrator(): (
  part: MessagePresentationPart,
) => Promise<MessagePresentationPart> {
  const concurrency = 4;
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = async (): Promise<void> => {
    if (active < concurrency) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      waiting.push(() => {
        active += 1;
        resolve();
      });
    });
  };
  const release = (): void => {
    active -= 1;
    waiting.shift()?.();
  };
  return async (part) => {
    if (part.kind !== "media" || !offlineMediaNeedsHydration(part.url)) {
      return part;
    }
    await acquire();
    try {
      return await hydrateOfflineMediaPart(part);
    } finally {
      release();
    }
  };
}

async function hydrateOfflineMediaPart(
  part: MessagePresentationPart,
): Promise<MessagePresentationPart> {
  if (part.kind !== "media") {
    return part;
  }
  try {
    const response = await fetch(part.url);
    if (!response.ok) {
      return offlineMediaFallback(part);
    }
    return {
      ...part,
      url: await blobDataUrl(await response.blob()),
    };
  } catch {
    return offlineMediaFallback(part);
  }
}

function offlineMediaNeedsHydration(url: string): boolean {
  const normalized = url.trim();
  if (normalized.toLowerCase().startsWith("blob:")) {
    return true;
  }
  try {
    const resolved = new URL(normalized, window.location.href);
    return ["http:", "https:"].includes(resolved.protocol)
      && resolved.origin === window.location.origin;
  } catch {
    return false;
  }
}

function offlineMediaFallback(
  part: Extract<MessagePresentationPart, { kind: "media" }>,
): MessagePresentationPart {
  if (part.url.trim().startsWith("/") && !part.url.trim().startsWith("//")) {
    return {
      ...part,
      url: new URL(part.url, window.location.href).href,
    };
  }
  return {
    ...part,
    url: "",
  };
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error));
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to encode exported media."));
    });
    reader.readAsDataURL(blob);
  });
}

function escapeDocumentHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

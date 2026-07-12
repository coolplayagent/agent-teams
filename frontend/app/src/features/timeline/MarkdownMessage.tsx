import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeCodeHighlight } from "./markdownHighlight";

interface MarkdownMessageProps {
  resizeTimelineRow?: (index: number, size: number) => void;
  streaming?: boolean;
  text: string;
}

const STREAMING_MARKDOWN_SHORT_INTERVAL_MS = 80;
const STREAMING_MARKDOWN_MEDIUM_INTERVAL_MS = 180;
const STREAMING_MARKDOWN_LONG_INTERVAL_MS = 400;

const markdownComponents: Components = {
  a({ children, href, ...props }) {
    return (
      <a {...props} href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  },
  code({ children, className, ...props }) {
    const language = codeLanguage(className);
    return (
      <code {...props} className={className} data-language={language}>
        {children}
      </code>
    );
  },
};

export const MarkdownMessage = memo(function MarkdownMessage({
  resizeTimelineRow,
  streaming = false,
  text,
}: MarkdownMessageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bufferedText = useStreamingMarkdownBuffer(text, streaming);
  const markdownText = stripMarkdownFrontmatter(
    streaming ? bufferedText : text,
  );
  const unbufferedTail = streaming && text.startsWith(bufferedText)
    ? text.slice(bufferedText.length)
    : "";
  useLayoutEffect(() => {
    if (resizeTimelineRow === undefined) {
      return;
    }
    const timelineRow = containerRef.current?.closest<HTMLElement>(
      ".at-timeline-row[data-index]",
    ) ?? null;
    const index = Number(timelineRow?.dataset.index);
    if (timelineRow === null || !Number.isInteger(index) || index < 0) {
      return;
    }
    const offsetHeight = timelineRow.offsetHeight;
    const size = offsetHeight > 0
      ? offsetHeight
      : timelineRow.getBoundingClientRect().height;
    if (Number.isFinite(size) && size > 0) {
      resizeTimelineRow(index, size);
    }
  }, [markdownText, resizeTimelineRow]);
  return (
    <div
      className="at-message-markdown"
      data-stream-buffered={streaming ? "true" : undefined}
      ref={containerRef}
    >
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={streaming ? [] : [rehypeCodeHighlight]}
        remarkPlugins={[remarkGfm]}
      >
        {markdownText}
      </ReactMarkdown>
      {unbufferedTail.length > 0 ? (
        <span
          className="at-message-streaming-tail"
          style={{ whiteSpace: "pre-wrap" }}
        >
          {unbufferedTail}
        </span>
      ) : null}
    </div>
  );
});

function useStreamingMarkdownBuffer(text: string, streaming: boolean): string {
  const [bufferedText, setBufferedText] = useState(text);
  const latestTextRef = useRef(text);
  const timerRef = useRef<number | null>(null);
  latestTextRef.current = text;

  useEffect(() => {
    if (!streaming) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setBufferedText(text);
      return;
    }
    if (bufferedText === text || timerRef.current !== null) {
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setBufferedText(latestTextRef.current);
    }, streamingMarkdownInterval(text.length));
  }, [bufferedText, streaming, text]);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  return bufferedText;
}

export function streamingMarkdownInterval(textLength: number): number {
  if (textLength < 4_000) {
    return STREAMING_MARKDOWN_SHORT_INTERVAL_MS;
  }
  if (textLength < 16_000) {
    return STREAMING_MARKDOWN_MEDIUM_INTERVAL_MS;
  }
  return STREAMING_MARKDOWN_LONG_INTERVAL_MS;
}

export function stripMarkdownFrontmatter(text: string): string {
  const frontmatterMatch = text.match(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  if (frontmatterMatch === null) {
    return text;
  }
  return text.slice(frontmatterMatch[0].length);
}

function codeLanguage(className: string | undefined): string | undefined {
  const match = className?.match(/\blanguage-([a-z0-9_-]+)/i);
  return match?.[1];
}

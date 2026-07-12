import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeCodeHighlight } from "./markdownHighlight";

interface MarkdownMessageProps {
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
  streaming = false,
  text,
}: MarkdownMessageProps) {
  const bufferedText = useStreamingMarkdownBuffer(text, streaming);
  const markdownText = stripMarkdownFrontmatter(
    streaming ? bufferedText : text,
  );
  return (
    <div
      className="at-message-markdown"
      data-stream-buffered={streaming ? "true" : undefined}
    >
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={streaming ? [] : [rehypeCodeHighlight]}
        remarkPlugins={[remarkGfm]}
      >
        {markdownText}
      </ReactMarkdown>
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

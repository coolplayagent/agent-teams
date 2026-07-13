import { memo, useEffect, useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeCodeHighlight } from "./markdownHighlight";

interface MarkdownMessageProps {
  resizeTimelineRow?: (index: number, size: number) => void;
  streaming?: boolean;
  text: string;
}

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
  const lastMeasuredSizeRef = useRef<number | null>(null);
  const visibleText = stripMarkdownFrontmatter(text);
  useEffect(() => {
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
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === timelineRow);
      if (entry === undefined) {
        return;
      }
      const size = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
      if (
        Number.isFinite(size) &&
        size > 0 &&
        lastMeasuredSizeRef.current !== size
      ) {
        lastMeasuredSizeRef.current = size;
        resizeTimelineRow(index, size);
      }
    });
    observer.observe(timelineRow);
    return () => observer.disconnect();
  }, [resizeTimelineRow]);
  return (
    <div
      className="at-message-markdown"
      data-streaming={streaming ? "true" : undefined}
      ref={containerRef}
    >
      {streaming ? (
        <span className="at-message-streaming-plain">
          {visibleText}
        </span>
      ) : (
        <ReactMarkdown
          components={markdownComponents}
          rehypePlugins={[rehypeCodeHighlight]}
          remarkPlugins={[remarkGfm]}
        >
          {visibleText}
        </ReactMarkdown>
      )}
    </div>
  );
});

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

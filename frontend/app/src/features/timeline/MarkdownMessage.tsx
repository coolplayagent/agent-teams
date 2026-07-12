import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeCodeHighlight } from "./markdownHighlight";

interface MarkdownMessageProps {
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

export function MarkdownMessage({ text }: MarkdownMessageProps) {
  const markdownText = stripMarkdownFrontmatter(text);
  return (
    <div className="at-message-markdown">
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeCodeHighlight]}
        remarkPlugins={[remarkGfm]}
      >
        {markdownText}
      </ReactMarkdown>
    </div>
  );
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

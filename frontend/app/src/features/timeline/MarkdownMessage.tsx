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
  return (
    <div className="at-message-markdown">
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeCodeHighlight]}
        remarkPlugins={[remarkGfm]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function codeLanguage(className: string | undefined): string | undefined {
  const match = className?.match(/\blanguage-([a-z0-9_-]+)/i);
  return match?.[1];
}

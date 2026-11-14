'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

export default function ProjectCommentBody({ text }: { text: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => setOverflowing(content.scrollHeight > content.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="min-w-0">
      <div ref={contentRef} className={`min-w-0 break-words text-text-secondary [overflow-wrap:anywhere] ${expanded ? '' : 'max-h-28 overflow-hidden'}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          allowedElements={['h1', 'h2', 'h3', 'p', 'strong', 'em', 'u', 'del', 'ul', 'ol', 'li', 'a', 'br']}
          components={{
            h1: ({ children }) => <h1 className="mb-2 mt-3 text-heading-sm font-bold text-text-primary">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-2 mt-3 text-body font-bold text-text-primary">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-1 mt-2 text-body-sm font-bold text-text-primary">{children}</h3>,
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
            ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
            a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary-hover">{children}</a>,
            u: ({ children }) => <u>{children}</u>,
          }}
        >{text}</ReactMarkdown>
      </div>
      {(overflowing || expanded) && (
        <button type="button" onClick={() => setExpanded(value => !value)} className="mt-1 text-caption font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
          {expanded ? 'Mostrar menos' : 'Mostrar mais'}
        </button>
      )}
    </div>
  );
}

import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

// Inline mode is also safe inside clickable project previews: no nested links.
export default function MarkdownContent({ text, inline = false }: { text: string; inline?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
      allowedElements={['h1', 'h2', 'h3', 'p', 'strong', 'em', 'u', 'del', 'ul', 'ol', 'li', 'a', 'br']}
      components={inline ? {
        h1: ({ children }) => <span>{children} </span>,
        h2: ({ children }) => <span>{children} </span>,
        h3: ({ children }) => <span>{children} </span>,
        p: ({ children }) => <span>{children} </span>,
        strong: ({ children }) => <span>{children}</span>,
        em: ({ children }) => <span>{children}</span>,
        u: ({ children }) => <span>{children}</span>,
        del: ({ children }) => <span>{children}</span>,
        ul: ({ children }) => <span>{children}</span>,
        ol: ({ children }) => <span>{children}</span>,
        li: ({ children }) => <span>{children} </span>,
        a: ({ children }) => <span>{children}</span>,
        br: () => <span> </span>,
      } : {
        h1: ({ children }) => <h1 className="mb-2 mt-3 text-heading-sm font-bold text-text-primary">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-3 text-body font-bold text-text-primary">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-2 text-body-sm font-bold text-text-primary">{children}</h3>,
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-ink underline hover:text-primary-hover">{children}</a>,
        u: ({ children }) => <u>{children}</u>,
      }}
    >{text}</ReactMarkdown>
  );
}

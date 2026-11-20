'use client';

import MarkdownBody from './MarkdownBody';

export default function MarkdownCommentBody({ text }: { text: string }) {
  return <MarkdownBody text={text} collapsible />;
}

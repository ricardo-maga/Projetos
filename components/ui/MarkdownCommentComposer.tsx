'use client';

import MarkdownEditor from './MarkdownEditor';
import { Button } from './Button';

export interface MarkdownCommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}

export default function MarkdownCommentComposer({
  value, onChange, onSubmit, maxLength = 1000, placeholder = 'Escreva um comentário ou nota...',
}: MarkdownCommentComposerProps) {
  const submit = () => {
    const markdown = value.trim();
    if (markdown && markdown.length <= maxLength) onSubmit(markdown);
  };

  return (
    <div className="min-w-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1" onKeyDownCapture={event => {
          if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'textbox') return;
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            submit();
          }
        }}>
          <MarkdownEditor value={value} onChange={onChange} ariaLabel="Comentário ou nota"
            maxLength={maxLength} placeholder={placeholder} />
        </div>
        <Button variant="primary" size="sm" type="button" disabled={!value.trim() || value.length > maxLength} onClick={submit}
          className="h-24 shrink-0 px-4 text-body-sm font-bold">Enviar</Button>
      </div>
      <p className="mt-1 text-caption text-text-muted">Enviar: Enter · Nova linha: Shift+Enter · {value.length}/{maxLength}</p>
    </div>
  );
}

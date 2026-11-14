'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Bold, Heading1, Heading2, Italic, Link2, List, ListOrdered } from 'lucide-react';
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
  const callbacks = useRef({ onChange, onSubmit, maxLength });
  callbacks.current = { onChange, onSubmit, maxLength };
  const lastAccepted = useRef(value);
  const [editingLink, setEditingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        link: { openOnClick: false },
        strike: false, code: false, codeBlock: false, blockquote: false, horizontalRule: false,
      }),
      Markdown,
    ],
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'h-24 overflow-y-auto rounded-control border border-border bg-surface p-3.5 text-body-sm text-text-primary shadow-flat outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 [&_h1]:text-heading-sm [&_h1]:font-bold [&_h2]:text-body [&_h2]:font-bold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline',
        'aria-label': 'Comentário ou nota',
      },
      handlePaste: (_view, event) => {
        // The editor keeps its own selection and sanitizes pasted rich text.
        if (event.clipboardData?.files.length) return true;
        return false;
      },
    },
    onUpdate: ({ editor: updated }) => {
      const markdown = updated.getMarkdown();
      if (markdown.length > callbacks.current.maxLength) {
        updated.commands.setContent(lastAccepted.current, { contentType: 'markdown', emitUpdate: false });
        return;
      }
      lastAccepted.current = markdown;
      callbacks.current.onChange(markdown);
    },
  });

  useEffect(() => {
    if (!editor || editor.getMarkdown() === value) return;
    lastAccepted.current = value;
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
  }, [editor, value]);

  const submit = () => {
    if (!editor) return;
    const markdown = editor.getMarkdown().trim();
    if (!markdown || markdown.length > maxLength) return;
    onSubmit(markdown);
    setEditingLink(false);
  };

  const formatButton = (label: string, Icon: typeof Bold, active: boolean, action: () => void) => (
    <button type="button" aria-label={label} title={label} aria-pressed={active}
      onMouseDown={event => event.preventDefault()} onClick={action}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary ${active ? 'bg-primary/10 text-primary' : 'text-text-secondary'}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  return (
    <div className="min-w-0">
      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1" onKeyDownCapture={event => {
          if (event.target !== editor?.view.dom) return;
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            submit();
          }
          if (event.key === 'Escape') setEditingLink(false);
        }}>
          {editor && (
            <>
              <EditorContent editor={editor} />
              {editor.isEmpty && <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-body-sm text-text-disabled">{placeholder}</span>}
              <BubbleMenu editor={editor} shouldShow={({ state }) => editingLink || !state.selection.empty}>
                <div role="toolbar" aria-label="Formatar texto selecionado" className="flex max-w-[min(100vw-2rem,28rem)] items-center gap-0.5 overflow-x-auto rounded-control border border-border bg-surface p-1 shadow-lg">
                  {editingLink ? (
                    <form onSubmit={event => {
                      event.preventDefault();
                      const href = linkUrl.trim();
                      if (!/^https?:\/\//i.test(href)) return;
                      editor.chain().focus().setLink({ href }).run();
                      setEditingLink(false);
                    }} className="flex items-center gap-1">
                      <input autoFocus type="url" required aria-label="Endereço do link" placeholder="https://..." value={linkUrl}
                        onChange={event => setLinkUrl(event.target.value)}
                        className="w-40 rounded-control border border-border bg-surface px-2 py-1 text-body-sm text-text-primary focus:outline-2 focus:outline-primary" />
                      <button type="submit" aria-label="Aplicar link" className="rounded-control px-2 py-1 text-primary hover:bg-surface-muted">✓</button>
                      <button type="button" aria-label="Cancelar link" onClick={() => setEditingLink(false)} className="rounded-control px-2 py-1 text-text-secondary hover:bg-surface-muted">×</button>
                    </form>
                  ) : (
                    <>
                      {formatButton('Negrito', Bold, editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
                      {formatButton('Itálico', Italic, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
                      {formatButton('Link', Link2, editor.isActive('link'), () => {
                        setLinkUrl(editor.getAttributes('link').href || '');
                        setEditingLink(true);
                      })}
                      <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                      {formatButton('Título 1', Heading1, editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
                      {formatButton('Título 2', Heading2, editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
                      {formatButton('Lista com marcas', List, editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run())}
                      {formatButton('Lista numerada', ListOrdered, editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run())}
                    </>
                  )}
                </div>
              </BubbleMenu>
            </>
          )}
        </div>
        <Button variant="primary" size="sm" type="button" disabled={!value.trim()} onClick={submit}
          className="h-24 shrink-0 px-4 text-body-sm font-bold">Enviar</Button>
      </div>
      <p className="mt-1 text-caption text-text-muted">Enviar: Enter · Nova linha: Shift+Enter · {value.length}/{maxLength}</p>
    </div>
  );
}

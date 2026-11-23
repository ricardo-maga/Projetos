'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Bold, Check, Heading1, Heading2, Italic, Link2, List, ListOrdered, X } from 'lucide-react';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  maxLength: number;
  heightClassName?: string;
  field?: string;
  error?: string;
}

function readFormatState(editor: Editor | null) {
  return editor ? {
    empty: editor.isEmpty,
    bold: editor.isActive('bold'), italic: editor.isActive('italic'), link: editor.isActive('link'),
    h1: editor.isActive('heading', { level: 1 }), h2: editor.isActive('heading', { level: 2 }),
    bullet: editor.isActive('bulletList'), ordered: editor.isActive('orderedList'),
  } : null;
}

export default function MarkdownEditor({
  value, onChange, ariaLabel, placeholder, maxLength, heightClassName = 'h-24', field, error,
}: MarkdownEditorProps) {
  const callbacks = useRef({ onChange, maxLength });
  callbacks.current = { onChange, maxLength };
  const lastAccepted = useRef(value);
  const selection = useRef<{ from: number; to: number } | null>(null);
  const linkSelection = useRef<{ from: number; to: number } | null>(null);
  const [touchMode, setTouchMode] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const linkInput = useRef<HTMLInputElement>(null);
  const linkErrorId = useId();
  const fieldErrorId = useId();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] }, link: { openOnClick: false },
        strike: false, code: false, codeBlock: false, blockquote: false, horizontalRule: false,
      }),
      Markdown,
    ],
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `${heightClassName} overflow-y-auto rounded-control border border-border bg-surface p-3.5 text-body-sm text-text-primary shadow-flat outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 [&_h1]:text-heading-sm [&_h1]:font-bold [&_h2]:text-body [&_h2]:font-bold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-primary-ink [&_a]:underline`,
        'aria-label': ariaLabel, role: 'textbox', 'aria-multiline': 'true',
      },
      handlePaste: (_view, event) => !!event.clipboardData?.files.length,
    },
    onSelectionUpdate: ({ editor: current }) => {
      selection.current = { from: current.state.selection.from, to: current.state.selection.to };
    },
    onUpdate: ({ editor: updated }) => {
      const markdown = updated.getMarkdown();
      if (markdown.length > callbacks.current.maxLength) {
        const position = updated.state.selection.from;
        updated.commands.setContent(lastAccepted.current, { contentType: 'markdown', emitUpdate: false });
        updated.commands.setTextSelection(Math.min(position, updated.state.doc.content.size));
        return;
      }
      lastAccepted.current = markdown;
      callbacks.current.onChange(markdown);
    },
  });
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    if (field) element.dataset.field = field;
    if (error) {
      element.setAttribute('aria-invalid', 'true');
      element.setAttribute('aria-describedby', fieldErrorId);
    } else {
      element.removeAttribute('aria-invalid');
      element.removeAttribute('aria-describedby');
    }
  }, [editor, error, field, fieldErrorId]);

  const selectedState = useEditorState({
    editor,
    selector: ({ editor: current }) => readFormatState(current),
  });
  // With immediatelyRender:false the subscription has no transaction yet.
  // Still mount EditorContent so the editor can attach and start publishing state.
  const state = selectedState ?? readFormatState(editor);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setTouchMode(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!editor) return;
    lastAccepted.current = value;
    if (editor.getMarkdown() === value) return;
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    selection.current = null;
    linkSelection.current = null;
    setEditingLink(false);
  }, [editor, value]);

  useEffect(() => {
    if (editingLink) linkInput.current?.focus();
  }, [editingLink, touchMode]);

  if (!editor || !state) return <div className={`${heightClassName} rounded-control border border-border bg-surface`} />;

  const restoreSelection = (range = selection.current) => {
    const chain = editor.chain().focus();
    if (range) chain.setTextSelection(range);
    return chain;
  };
  const closeLink = () => {
    restoreSelection(linkSelection.current).run();
    setEditingLink(false);
    setLinkError('');
  };
  const applyLink = () => {
    const href = linkUrl.trim();
    try {
      const url = new URL(href);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch {
      setLinkError('Introduza um endereço válido com http:// ou https://.');
      return;
    }
    restoreSelection(linkSelection.current).setLink({ href }).run();
    setEditingLink(false);
    setLinkError('');
  };
  const button = (label: string, Icon: typeof Bold, active: boolean, action: () => void) => (
    <button type="button" aria-label={label} title={label} aria-pressed={active}
      onPointerDown={event => {
        // Keep the native selection and keyboard while tapping toolbar buttons.
        if (editor.isFocused) selection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
        event.preventDefault();
      }}
      onMouseDown={event => event.preventDefault()} onClick={action}
      className={`flex shrink-0 items-center justify-center rounded-control hover:bg-surface-muted active:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary ${touchMode ? 'h-11 w-11' : 'h-8 w-8'} ${active ? 'bg-primary/10 text-primary-ink' : 'text-text-secondary'}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
  const toolbar = (
    <div role="toolbar" aria-label={`Formatar ${ariaLabel.toLowerCase()}`}
      className={`flex items-center rounded-control border border-border bg-surface p-1 ${touchMode ? 'flex-wrap gap-2' : 'max-w-[min(100vw-2rem,28rem)] gap-0.5 shadow-overlay'}`}>
      {button('Negrito', Bold, state.bold, () => restoreSelection().toggleBold().run())}
      {button('Itálico', Italic, state.italic, () => restoreSelection().toggleItalic().run())}
      {button('Link', Link2, state.link, () => {
        linkSelection.current = selection.current || { from: editor.state.selection.from, to: editor.state.selection.to };
        setLinkUrl(editor.getAttributes('link').href || '');
        setLinkError('');
        setEditingLink(true);
      })}
      {button('Título 1', Heading1, state.h1, () => restoreSelection().toggleHeading({ level: 1 }).run())}
      {button('Título 2', Heading2, state.h2, () => restoreSelection().toggleHeading({ level: 2 }).run())}
      {button('Lista com marcas', List, state.bullet, () => restoreSelection().toggleBulletList().run())}
      {button('Lista numerada', ListOrdered, state.ordered, () => restoreSelection().toggleOrderedList().run())}
    </div>
  );

  return (
    <div className="min-w-0 space-y-2" onKeyDown={event => {
      if (event.key === 'Escape' && editingLink) {
        event.preventDefault(); event.stopPropagation(); closeLink();
      }
    }}>
      <div className="relative min-w-0" onPointerDown={event => {
        setTouchMode(event.pointerType !== 'mouse');
      }}>
        <EditorContent editor={editor} />
        {error && <p id={fieldErrorId} className="text-caption text-error">{error}</p>}
        {state.empty && <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-body-sm text-text-muted">{placeholder}</span>}
      </div>
      {touchMode ? toolbar : !editingLink && (
        <BubbleMenu editor={editor} shouldShow={({ state: current }) => !current.selection.empty}>{toolbar}</BubbleMenu>
      )}
      {editingLink && (
        <div className="space-y-1 rounded-control border border-border bg-surface p-2" role="group" aria-label="Editar link">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={linkInput} type="url" aria-label="Endereço do link" aria-invalid={!!linkError} aria-describedby={linkError ? linkErrorId : undefined}
              placeholder="https://..." value={linkUrl} onChange={event => { setLinkUrl(event.target.value); setLinkError(''); }}
              onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); applyLink(); }
              }}
              className="h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-body-sm text-text-primary focus:outline-2 focus:outline-primary" />
            <button type="button" aria-label="Aplicar link" onClick={applyLink} className="flex h-11 w-11 items-center justify-center rounded-control text-primary-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"><Check className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" aria-label="Cancelar link" onClick={closeLink} className="flex h-11 w-11 items-center justify-center rounded-control text-text-secondary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          {linkError && <p id={linkErrorId} role="alert" className="text-caption text-text-secondary">{linkError}</p>}
        </div>
      )}
    </div>
  );
}

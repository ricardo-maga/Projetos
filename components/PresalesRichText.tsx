'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

export default function PresalesRichText({ value, onChange, readOnly }: {
  value: string; onChange: (value: string) => void; readOnly: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit], content: value || '<p></p>', editable: !readOnly,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'prose prose-sm max-w-none min-h-24 rounded-control border border-border bg-surface p-3 focus:outline-primary' } },
    onUpdate: ({ editor: updated }) => onChange(updated.getHTML()),
  });
  useEffect(() => { if (editor) editor.setEditable(!readOnly); }, [editor, readOnly]);
  useEffect(() => {
    if (editor && editor.getHTML() !== (value || '<p></p>')) editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
  }, [editor, value]);
  if (!editor) return <p role="status">A carregar editor…</p>;
  return <div className="space-y-2">
    {!readOnly && <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Formatar texto">
      <button type="button" aria-label="Negrito" aria-pressed={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}
        className="rounded-control border border-border px-3 py-1 font-bold">B</button>
      <button type="button" aria-label="Itálico" aria-pressed={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}
        className="rounded-control border border-border px-3 py-1 italic">I</button>
      <button type="button" aria-label="Lista" aria-pressed={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}
        className="rounded-control border border-border px-3 py-1">• Lista</button>
      <button type="button" aria-label="Lista numerada" aria-pressed={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className="rounded-control border border-border px-3 py-1">1. Lista</button>
      <button type="button" aria-label="Título" aria-pressed={editor.isActive('heading',{level:2})} onClick={() => editor.chain().focus().toggleHeading({level:2}).run()}
        className="rounded-control border border-border px-3 py-1">Título</button>
    </div>}
    <EditorContent editor={editor} />
  </div>;
}

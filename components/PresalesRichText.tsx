'use client';

import { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';

export default function PresalesRichText({ value, onChange, readOnly }: {
  value: string; onChange: (value: string) => void; readOnly: boolean;
}) {
  const [showSource, setShowSource] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, FontSize, TextAlign.configure({ types: ['heading','paragraph'] })], content: value || '<p></p>', editable: !readOnly,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'presales-rich-text min-h-24 rounded-control border border-border bg-surface p-3 focus:outline-primary' } },
    onUpdate: ({ editor: updated }) => onChange(updated.getHTML()),
  });
  useEffect(() => { if (editor) editor.setEditable(!readOnly && !showSource); }, [editor, readOnly, showSource]);
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
      <button type="button" aria-label="Subtítulo" aria-pressed={editor.isActive('heading',{level:3})} onClick={() => editor.chain().focus().toggleHeading({level:3}).run()}
        className="rounded-control border border-border px-3 py-1">Subtítulo</button>
      {(['left','center','right','justify'] as const).map(align => <button key={align} type="button" aria-label={`Alinhar ${align}`}
        aria-pressed={editor.isActive({ textAlign: align })} onClick={() => editor.chain().focus().setTextAlign(align).run()}
        className="rounded-control border border-border px-3 py-1">{({left:'Esquerda',center:'Centro',right:'Direita',justify:'Justificar'} as const)[align]}</button>)}
      <select aria-label="Tamanho do texto" defaultValue="" onChange={event => {
        if (event.target.value) editor.chain().focus().setFontSize(event.target.value).run();
        else editor.chain().focus().unsetFontSize().run();
      }} className="rounded-control border border-border bg-surface px-2">
        <option value="">Tamanho</option>{['12','14','16','18','20','24','28'].map(size => <option key={size} value={`${size}px`}>{size}px</option>)}
      </select>
      <button type="button" aria-pressed={showSource} onClick={() => setShowSource(current => !current)}
        className="rounded-control border border-border px-3 py-1">{showSource ? 'Editor' : 'Ver fonte'}</button>
    </div>}
    {showSource ? <textarea aria-label="Fonte HTML da secção" readOnly={readOnly} value={value}
      onChange={event => onChange(event.target.value)} className="min-h-32 w-full rounded-control border border-border bg-surface p-3 font-mono text-sm" />
      : <EditorContent editor={editor} />}
  </div>;
}

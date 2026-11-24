import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MarkdownEditor from '../../components/ui/MarkdownEditor';
import MarkdownCommentComposer from '../../components/ui/MarkdownCommentComposer';
import MarkdownBody from '../../components/ui/MarkdownBody';

function Preview() {
  const [description, setDescription] = useState('Motor e sensor');
  const [saved, setSaved] = useState('Motor e sensor');
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<string[]>([]);
  const [saveCount, setSaveCount] = useState(0);
  return <main id="main-root" data-theme="violet" className="mx-auto max-w-2xl space-y-6 bg-surface p-3 text-text-primary">
    <h1>Revisão local de formatação</h1>
    <form onSubmit={event => { event.preventDefault(); setSaved(description); setSaveCount(count => count + 1); }} className="space-y-2">
      <h2>Descrição</h2>
      <MarkdownEditor value={description} onChange={setDescription} ariaLabel="Descrição" maxLength={10000} heightClassName="h-40" placeholder="Introduza os detalhes do projeto..." />
      <output data-testid="description">{description}</output>
      <div className="flex gap-2">
        <button type="submit">Gravar projeto</button>
        <button type="button" onClick={() => setDescription(saved)}>Cancelar alterações</button>
        <button type="button" onClick={() => setDescription('a'.repeat(9998))}>Preencher limite</button>
      </div>
    </form>
    <output data-testid="save-count">{saveCount}</output>
    <section aria-label="Descrição guardada"><MarkdownBody text={saved} /></section>
    <h2>Notas e comentários</h2>
    <MarkdownCommentComposer value={comment} onChange={setComment} onSubmit={async text => {
      if (new URLSearchParams(window.location.search).has('asyncComments')) {
        const response = await fetch('/comment-submit', { method: 'POST', body: text });
        if (!response.ok) throw new Error('Synthetic comment submission failed');
      }
      setComments(items => [...items, text]); setComment('');
    }} />
    <output data-testid="comment">{comment}</output>
    <section aria-label="Comentários enviados">{comments.map((text, index) => <MarkdownBody key={index} text={text} collapsible />)}</section>
  </main>;
}

createRoot(document.getElementById('preview')!).render(<Preview />);

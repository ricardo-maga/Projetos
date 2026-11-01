'use client';

import { useEffect, useState } from 'react';
import { getAuthHeaders } from '../lib/clientAuth';
import { M3Button, M3Card, M3SectionHeader } from './M3';
import { Input } from './ui/Input';

type Template = { code:string; title:string; markdown:string; version:number };
type Origin = { code:string; label:string; active:boolean; sort_order:number };
export default function PresalesTemplatesSettings({ canWrite }: { canWrite:boolean }) {
  const [templates,setTemplates] = useState<Template[]>([]);
  const [origins,setOrigins] = useState<Origin[]>([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  useEffect(() => { void fetch('/api/v1/presales/templates',{headers:getAuthHeaders(),cache:'no-store'})
    .then(response => response.json()).then(result => result.success ? setTemplates(result.data) : setMessage(result.message))
    .catch(() => setMessage('Não foi possível carregar templates.')); },[]);
  useEffect(() => { void fetch('/api/v1/presales/origins',{headers:getAuthHeaders(),cache:'no-store'})
    .then(response => response.json()).then(result => result.success ? setOrigins(result.data) : setMessage(result.message))
    .catch(() => setMessage('Não foi possível carregar origens.')); },[]);
  const save = async (template:Template) => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/v1/presales/templates',{method:'PATCH',headers:getAuthHeaders(),body:JSON.stringify(template)});
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Erro de gravação.');
      setTemplates(current => current.map(item => item.code===template.code ? {...item,version:result.data.version} : item));
      setMessage('Template guardado.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Erro de gravação.'); }
    finally { setBusy(false); }
  };
  const saveOrigin = async (origin:Origin) => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/v1/presales/origins',{method:'PATCH',headers:getAuthHeaders(),body:JSON.stringify(origin)});
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Erro de gravação.');
      setMessage('Origem guardada.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Erro de gravação.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4"><M3SectionHeader title="Templates Presales" description="Estruturas Markdown para a futura geração de propostas. Os campos entre chavetas serão preenchidos pelo processo." />
    {message && <p role="status">{message}</p>}
    <M3Card className="space-y-3 border border-border bg-surface p-5"><h3 className="font-bold">Origem Presales</h3>
      {origins.map(origin => <div key={origin.code} className="flex flex-wrap items-end gap-3">
        <Input label={origin.code} value={origin.label} disabled={!canWrite} onChange={event => setOrigins(current => current.map(item => item.code===origin.code ? {...item,label:event.target.value} : item))} />
        <label className="flex items-center gap-2"><input type="checkbox" checked={origin.active} disabled={!canWrite}
          onChange={event => setOrigins(current => current.map(item => item.code===origin.code ? {...item,active:event.target.checked} : item))} />Ativa</label>
        {canWrite && <M3Button disabled={busy} onClick={() => void saveOrigin(origin)}>Guardar</M3Button>}
      </div>)}
    </M3Card>
    {templates.map(template => <M3Card key={template.code} className="space-y-3 border border-border bg-surface p-5">
      <Input label="Nome do template" value={template.title} disabled={!canWrite} onChange={event => setTemplates(current => current.map(item => item.code===template.code ? {...item,title:event.target.value} : item))} />
      <label className="block text-sm font-semibold">Estrutura Markdown<textarea aria-label={`Estrutura ${template.title}`} value={template.markdown} disabled={!canWrite}
        onChange={event => setTemplates(current => current.map(item => item.code===template.code ? {...item,markdown:event.target.value} : item))}
        className="mt-1 min-h-48 w-full rounded-control border border-border bg-surface p-3 font-mono text-sm" /></label>
      {canWrite && <M3Button disabled={busy} onClick={() => void save(template)}>Guardar template</M3Button>}
    </M3Card>)}
  </div>;
}

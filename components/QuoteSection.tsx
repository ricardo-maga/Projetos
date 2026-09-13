'use client';

import React, { useState } from 'react';
import { Quote, BillOfMaterial, Material, Client } from '../lib/types';
import { Plus, Search, Edit2, Trash2, ArrowLeft, PlusCircle, LayoutGrid, Euro, Layers, Calendar } from 'lucide-react';

interface QuoteSectionProps {
  quotes: Quote[];
  bomItems: BillOfMaterial[];
  materials: Material[];
  clients: Client[];
  addQuote: (q: any) => any;
  updateQuote: (id: string, updates: any) => void;
  deleteQuote: (id: string) => void;
  addBOMItem: (item: any) => void;
  deleteBOMItem: (id: string) => void;
}

export default function QuoteSection({
  quotes,
  bomItems,
  materials,
  clients,
  addQuote,
  updateQuote,
  deleteQuote,
  addBOMItem,
  deleteBOMItem,
}: QuoteSectionProps) {
  const [search, setSearch] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  
  // Quote Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formClient, setFormClient] = useState('');
  const [formStatus, setFormStatus] = useState<string>('Draft');
  const [formVersion, setFormVersion] = useState('v1.0');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formResponsible, setFormResponsible] = useState('Ricardo Gomes');

  // New BOM Item State
  const [selectedMaterialId, setSelectedMaterialId] = useState(materials[0]?.id || '');
  const [bomQty, setBomQty] = useState(1);

  const activeQuotes = quotes.filter(q => !q.deleted);
  const filteredQuotes = activeQuotes.filter(q => {
    const client = clients.find(c => c.id === (q.projectIdOrClientId || q.clientId || q.projectId));
    const clientName = client ? client.clientName : '';
    return clientName.toLowerCase().includes(search.toLowerCase()) || 
           q.id.toLowerCase().includes(search.toLowerCase());
  });

  const selectedQuote = activeQuotes.find(q => q.id === selectedQuoteId);
  const activeBoms = bomItems.filter(b => b.quoteId === selectedQuoteId && !b.deleted);

  const openForm = (quote: Quote | null) => {
    if (quote) {
      setEditingId(quote.id);
      setFormClient(quote.projectIdOrClientId || quote.clientId || quote.projectId || '');
      setFormStatus(quote.status);
      setFormVersion(String(quote.version));
      setFormValidUntil(quote.validUntil);
      setFormResponsible(quote.responsible || '');
    } else {
      setEditingId(null);
      setFormClient(clients[0]?.id || '');
      setFormStatus('Draft');
      setFormVersion('v1.0');
      setFormValidUntil('');
      setFormResponsible('Ricardo Gomes');
    }
    setIsEditing(true);
  };

  const calculateBOMTotal = (quoteId: string) => {
    const quoteBoms = bomItems.filter(b => b.quoteId === quoteId && !b.deleted);
    return quoteBoms.reduce((sum, item) => {
      const mat = materials.find(m => m.id === item.materialId);
      const cost = mat ? mat.unitCost : 0;
      return sum + (cost * item.quantity);
    }, 0);
  };

  const handleSubmitQuote = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      projectIdOrClientId: formClient,
      status: formStatus,
      version: formVersion,
      totalValue: editingId ? calculateBOMTotal(editingId) : 0, // initially 0 or calculated
      validUntil: formValidUntil,
      responsible: formResponsible,
    };

    if (editingId) {
      updateQuote(editingId, { ...payload, totalValue: calculateBOMTotal(editingId) });
    } else {
      addQuote(payload);
    }
    setIsEditing(false);
  };

  const handleAddBOM = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuoteId) return;

    addBOMItem({
      quoteId: selectedQuoteId,
      materialId: selectedMaterialId,
      quantity: Number(bomQty),
    });

    // Recalculate quote total
    setTimeout(() => {
      const newTotal = calculateBOMTotal(selectedQuoteId);
      updateQuote(selectedQuoteId, { totalValue: newTotal });
    }, 50);

    setBomQty(1);
  };

  const handleRemoveBOM = (itemId: string) => {
    if (!selectedQuoteId) return;
    deleteBOMItem(itemId);

    // Recalculate quote total
    setTimeout(() => {
      const newTotal = calculateBOMTotal(selectedQuoteId);
      updateQuote(selectedQuoteId, { totalValue: newTotal });
    }, 50);
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.clientName || 'Cliente';

  return (
    <div className="space-y-6">
      
      {selectedQuote && !isEditing ? (
        <div className="bg-white rounded-2xl border border-slate-200 -sm overflow-hidden animate-fade-in text-xs font-bold text-slate-700">
          
          <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <button 
              onClick={() => setSelectedQuoteId(null)}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-semibold"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar aos Orçamentos
            </button>
            <div className="flex gap-2">
              <button 
                onClick={() => openForm(selectedQuote)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl"
              >
                <Edit2 className="w-3.5 h-3.5" /> Editar Orçamento
              </button>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Meta panel */}
            <div className="md:col-span-4 bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-5">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">Proposta</span>
                <div className="text-base font-extrabold text-slate-900">{getClientName(selectedQuote.projectIdOrClientId || selectedQuote.clientId || selectedQuote.projectId || '')}</div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">ID Orçamento: {selectedQuote.id}</div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">Valor Total Orçado</span>
                <div className="text-2xl font-extrabold text-slate-950 flex items-center gap-1.5">
                  <Euro className="w-6 h-6 text-indigo-600" />
                  {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(selectedQuote.totalValue)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">Estado</span>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                    selectedQuote.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    selectedQuote.status === 'Sent' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                    selectedQuote.status === 'Declined' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {selectedQuote.status}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">Versão</span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-bold font-mono">
                    {selectedQuote.version}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-slate-700 border-t border-slate-200/60 pt-4">
                <div className="flex justify-between">
                  <span className="text-slate-400">Validade:</span>
                  <span>{selectedQuote.validUntil || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Responsável:</span>
                  <span>{selectedQuote.responsible}</span>
                </div>
              </div>
            </div>

            {/* Bill of Materials (BOM) Editor */}
            <div className="md:col-span-8 space-y-6">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                Composição do Orçamento (Bill of Materials)
              </h3>

              {/* Add Material to BOM form */}
              <form onSubmit={handleAddBOM} className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-slate-500">Selecionar Artigo / Material</label>
                  <select 
                    value={selectedMaterialId}
                    onChange={e => setSelectedMaterialId(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs"
                  >
                    {materials.filter(m => !m.deleted).map(m => (
                      <option key={m.id} value={m.id}>{m.name} - ({m.supplier}) [{m.unitCost}€/{m.unit}]</option>
                    ))}
                  </select>
                </div>
                <div className="w-24 space-y-1">
                  <label className="text-[10px] text-slate-500">Quant.</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    value={bomQty}
                    onChange={e => setBomQty(Number(e.target.value))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" /> Adicionar Artigo
                </button>
              </form>

              {/* BOM items table list */}
              {activeBoms.length === 0 ? (
                <p className="text-slate-400 italic py-6 text-center">Este orçamento não possui materiais ou custos associados. Adicione artigos acima para computar o valor total!</p>
              ) : (
                <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <div className="overflow-x-auto w-full">
                    <table className="w-full min-w-[550px] text-left border-collapse text-xs">
                      <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200/80 whitespace-nowrap select-none">
                      <tr>
                        <th className="px-4 py-3 text-left">Artigo / Referência</th>
                        <th className="px-4 py-3 text-center">Quant.</th>
                        <th className="px-4 py-3 text-right">Custo Unitário</th>
                        <th className="px-4 py-3 text-right">Total Subparcial</th>
                        <th className="px-4 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {activeBoms.map(item => {
                        const mat = materials.find(m => m.id === item.materialId);
                        const cost = mat ? mat.unitCost : 0;
                        const subTotal = cost * item.quantity;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3">
                              <span className="font-bold text-slate-800">{mat ? mat.name : 'Material Eliminado'}</span>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{mat ? mat.reference : 'S/R'}</div>
                            </td>
                            <td className="px-4 py-3 text-center font-bold">{item.quantity} {mat?.unit || 'un'}</td>
                            <td className="px-4 py-3 text-right font-mono">
                              {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cost)}
                            </td>
                            <td className="px-4 py-3 text-right font-extrabold text-slate-900 font-mono">
                              {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(subTotal)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button 
                                type="button"
                                onClick={() => handleRemoveBOM(item.id)}
                                className="text-red-500 hover:text-red-700 font-bold cursor-pointer transition-colors"
                              >
                                Remover
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : isEditing ? (
        <form onSubmit={handleSubmitQuote} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 -sm animate-fade-in text-xs font-bold text-slate-700">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-800">
              {editingId ? 'Editar Orçamento' : 'Criar Nova Proposta Comercial'}
            </h2>
            <button 
              type="button" 
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 text-slate-500 bg-slate-50 border border-slate-200 rounded-xl"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1">
              <label className="block text-slate-500">Cliente Recipiente *</label>
              <select 
                value={formClient}
                onChange={e => setFormClient(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
              >
                {clients.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Estado da Proposta *</label>
              <select 
                value={formStatus}
                onChange={e => setFormStatus(e.target.value as any)}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
              >
                <option value="Draft">Draft (Rascunho)</option>
                <option value="Sent">Sent (Enviado)</option>
                <option value="Approved">Approved (Aprovado)</option>
                <option value="Declined">Declined (Recusado)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Versão de Engenharia *</label>
              <input 
                type="text" 
                required
                value={formVersion}
                onChange={e => setFormVersion(e.target.value)}
                placeholder="Ex: v1.0"
                className="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Validade da Proposta</label>
              <input 
                type="date" 
                value={formValidUntil}
                onChange={e => setFormValidUntil(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Responsável pela Proposta *</label>
              <input 
                type="text" 
                required
                value={formResponsible}
                onChange={e => setFormResponsible(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button 
              type="button" 
              onClick={() => setIsEditing(false)}
              className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 -sm"
            >
              Gravar Proposta
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden animate-fade-in">
          
          <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/60 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">Orçamentação Comercial & BOM</h2>
                <p className="text-xs text-slate-500 mt-0.5">Elabore orçamentos e listas de materiais industriais com auto-calculador de custos de catálogo.</p>
              </div>
              <button 
                type="button"
                onClick={() => openForm(null)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" /> Nova Proposta
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <input 
                type="text" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Procurar por código ou entidade cliente..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            {filteredQuotes.length === 0 ? (
              <div className="p-10 text-center text-slate-400 font-medium text-xs">Nenhuma proposta ou orçamento registado.</div>
            ) : (
              <table className="w-full min-w-[780px] text-left border-collapse text-xs">
                <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200/80 whitespace-nowrap select-none">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Código Orçamento</th>
                    <th className="px-5 py-3.5 text-left">Cliente</th>
                    <th className="px-5 py-3.5 text-left">Versão / Responsável</th>
                    <th className="px-5 py-3.5 text-left">Validade</th>
                    <th className="px-5 py-3.5 text-left">Estado</th>
                    <th className="px-5 py-3.5 text-right">Valor Total Estimado</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQuotes.map(q => (
                    <tr 
                      key={q.id} 
                      className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedQuoteId(q.id)}
                    >
                      <td className="px-5 py-3.5 font-mono font-bold text-slate-500">
                        {q.id}
                      </td>
                      <td className="px-5 py-3.5 font-extrabold text-slate-800 text-sm">
                        {getClientName(q.projectIdOrClientId || q.clientId || q.projectId || '')}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 font-medium">
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-mono mr-1.5 font-semibold">{q.version}</span>
                        {q.responsible}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 font-mono">
                        {q.validUntil || 'N/A'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          q.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          q.status === 'Sent' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          q.status === 'Declined' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-extrabold text-slate-950 font-mono text-sm">
                        {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(q.totalValue)}
                      </td>
                      <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2 justify-end">
                          <button 
                            type="button"
                            onClick={() => openForm(q)}
                            className="p-1.5 hover:bg-blue-50 hover:text-blue-700 rounded-md text-slate-500 cursor-pointer transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              if (confirm('Eliminar esta proposta?')) {
                                deleteQuote(q.id);
                              }
                            }}
                            className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-md text-slate-500 cursor-pointer transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-5 py-3.5 border-t border-slate-200/80 bg-slate-50/70 text-right text-xs text-slate-500 font-medium">
            A mostrar <span className="font-bold text-slate-800">{filteredQuotes.length}</span> {filteredQuotes.length === 1 ? 'orçamento' : 'orçamentos'}
          </div>
        </div>
      )}

    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { Client } from '../lib/types';
import { Plus, Search, Edit2, Trash2, Building, Mail, Phone, MapPin, Hash, X, Save } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

import { hasPermission } from '../lib/permissions';

interface ClientSectionProps {
  clients: Client[];
  projects?: any[];
  onSelectProject?: (projId: string | null) => void;
  addClient: (c: any) => void;
  updateClient: (id: string, updates: any) => void;
  deleteClient: (id: string) => void;
  currentUser?: any;
  userGroups?: any[];
}

export default function ClientSection({
  clients,
  projects = [],
  onSelectProject,
  addClient,
  updateClient,
  deleteClient,
  currentUser,
  userGroups = [],
}: ClientSectionProps) {
  const canReadClients = hasPermission(currentUser, 'clients_read', userGroups);
  const canWriteClients = hasPermission(currentUser, 'clients_write', userGroups);
  const canDeleteClients = hasPermission(currentUser, 'clients_delete', userGroups);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedClientForModal, setSelectedClientForModal] = useState<Client | null>(null);
  const [projectsCurrentPage, setProjectsCurrentPage] = useState(1);

  const [formName, setFormName] = useState('');
  const [formShortName, setFormShortName] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formTaxId, setFormTaxId] = useState('');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formContactEmail, setFormContactEmail] = useState('');
  const [formContactPhone, setFormContactPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  // Confirmation Modal state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const askConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm,
    });
  };

  const activeClients = (clients || []).filter(c => c && (showDeleted ? c.deleted : !c.deleted));
  const sortedClients = [...activeClients].sort((a, b) => {
    const nameA = (a.clientName || a.shortName || '').trim();
    const nameB = (b.clientName || b.shortName || '').trim();
    return nameA.localeCompare(nameB, 'pt-PT', { sensitivity: 'base' });
  });

  const filteredClients = sortedClients.filter(c => {
    const clientName = c.clientName || '';
    const shortName = c.shortName || '';
    const contactPerson = c.contactPerson || '';
    const notes = c.notes || '';
    return clientName.toLowerCase().includes(search.toLowerCase()) || 
           shortName.toLowerCase().includes(search.toLowerCase()) ||
           contactPerson.toLowerCase().includes(search.toLowerCase()) ||
           notes.toLowerCase().includes(search.toLowerCase());
  });

  const totalFiltered = filteredClients.length;
  const totalPages = Math.ceil(totalFiltered / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedClients = filteredClients.slice(startIndex, startIndex + pageSize);

  const openForm = (client: Client | null) => {
    if (client) {
      if (!canWriteClients) {
        alert('Não tem permissão para editar clientes.');
        return;
      }
      setEditingId(client.id);
      setFormName(client.clientName);
      setFormShortName(client.shortName);
      setFormLocation(client.location);
      setFormTaxId(client.taxId);
      setFormContactPerson(client.contactPerson);
      setFormContactEmail(client.contactEmail);
      setFormContactPhone(client.contactPhone);
      setFormNotes(client.notes || '');
    } else {
      if (!canWriteClients) {
        alert('Não tem permissão para criar clientes.');
        return;
      }
      setEditingId(null);
      setFormName('');
      setFormShortName('');
      setFormLocation('');
      setFormTaxId('');
      setFormContactPerson('');
      setFormContactEmail('');
      setFormContactPhone('');
      setFormNotes('');
    }
    setIsEditing(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteClients) {
      alert('Não tem permissão para criar ou editar clientes.');
      return;
    }
    const payload = {
      clientName: formName,
      shortName: formShortName,
      location: formLocation,
      taxId: formTaxId,
      contactPerson: formContactPerson,
      contactEmail: formContactEmail,
      contactPhone: formContactPhone,
      notes: formNotes,
    };

    if (editingId) {
      updateClient(editingId, payload);
    } else {
      addClient(payload);
    }
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {isEditing ? (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 -sm animate-fade-in text-xs font-bold text-slate-700">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-800">
              {editingId ? 'Editar Registo de Cliente' : 'Adicionar Novo Cliente (Entidade)'}
            </h2>
            <div className="flex items-center gap-2">
              <button 
                type="button" 
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white hover:bg-slate-800 font-bold rounded-xl text-xs shadow-sm transition-colors"
              >
                <Save className="w-3.5 h-3.5" /> Gravar Cliente
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1">
              <label className="block text-slate-500">Nome da Empresa / Cliente *</label>
              <input 
                type="text" 
                required
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Ex: Alimentos Gourmet, S.A."
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Abreviatura / Nome Curto *</label>
              <input 
                type="text" 
                required
                value={formShortName}
                onChange={e => setFormShortName(e.target.value)}
                placeholder="Ex: AGourmet"
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">NIF / Número Contribuinte (Tax ID)</label>
              <input 
                type="text" 
                value={formTaxId}
                onChange={e => setFormTaxId(e.target.value)}
                placeholder="Ex: PT 502948293"
                className="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Localização / Morada Principal</label>
              <input 
                type="text" 
                value={formLocation}
                onChange={e => setFormLocation(e.target.value)}
                placeholder="Ex: Zona Industrial de Aveiro, Lote 4"
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Pessoa de Contacto (Gestor de Compras)</label>
              <input 
                type="text" 
                value={formContactPerson}
                onChange={e => setFormContactPerson(e.target.value)}
                placeholder="Ex: Eng. Carlos Gomes"
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">E-mail de Contacto</label>
              <input 
                type="email" 
                value={formContactEmail}
                onChange={e => setFormContactEmail(e.target.value)}
                placeholder="Ex: compras@agourmet.pt"
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-500">Telemóvel / Telefone Contacto</label>
              <input 
                type="text" 
                value={formContactPhone}
                onChange={e => setFormContactPhone(e.target.value)}
                placeholder="Ex: +351 912 345 678"
                className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="block text-slate-500">Notas / Observações</label>
              <textarea 
                rows={3}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Observações internas, especificações ou acordos com o cliente..."
                className="w-full p-2.5 border border-slate-200 rounded-xl font-medium text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              Gravar Cliente
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 -sm overflow-hidden animate-fade-in">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-800">Diretório de Clientes</h2>
                <p className="text-xs text-slate-500">Gestão de entidades clientes, contactos fiscais e operacionais.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowDeleted(!showDeleted);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    showDeleted
                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {showDeleted ? 'Ver Clientes Ativos' : 'Reciclagem'}
                </button>
                {canWriteClients && (
                  <button 
                    onClick={() => openForm(null)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl -sm self-start md:self-auto"
                  >
                    <Plus className="w-4 h-4" /> Registar Cliente
                  </button>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Pesquisar por nome, abreviatura, contacto ou notas..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 outline-none font-medium"
              />
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            {filteredClients.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-medium text-xs">
                {showDeleted ? 'Nenhum cliente eliminado encontrado.' : 'Nenhum cliente registado ou encontrado.'}
              </div>
            ) : (
              <table className="w-full min-w-[750px] text-left border-collapse">
                <thead className="text-[11px] uppercase text-slate-400 font-bold bg-slate-50 border-b border-slate-100 whitespace-nowrap">
                  <tr>
                    <th className="px-5 py-3">Cliente</th>
                    <th className="px-5 py-3">NIF / Tax ID</th>
                    <th className="px-5 py-3">Localização</th>
                    <th className="px-5 py-3">Pessoa de Contacto</th>
                    <th className="px-5 py-3">Notas</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-100">
                  {paginatedClients.map(c => (
                    <tr key={c.id} className={`hover:bg-slate-50/50 transition-colors ${c.deleted ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${c.deleted ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                            <Building className="w-4 h-4" />
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedClientForModal(c);
                                setProjectsCurrentPage(1);
                              }}
                              className="font-extrabold text-slate-800 text-sm hover:text-blue-600 hover:underline transition-colors cursor-pointer text-left focus:outline-none"
                            >
                              {c.clientName}
                            </button>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 uppercase tracking-tight font-mono">{c.shortName}</span>
                              {c.deleted && (
                                <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold uppercase">
                                  Eliminado
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-slate-700">
                        {c.taxId || 'S/NIF'}
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate max-w-[180px]">{c.location || 'Sem Morada'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600 font-medium">
                        <div>{c.contactPerson || 'Sem Contacto'}</div>
                        <div className="text-[10px] text-slate-400 mt-1 flex flex-col gap-0.5">
                          {c.contactEmail && <span className="font-mono flex items-center gap-1"><Mail className="w-3 h-3" /> {c.contactEmail}</span>}
                          {c.contactPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.contactPhone}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-500 max-w-[200px]">
                        {c.notes ? (
                          <div className="text-[11px] bg-slate-50 border border-slate-100 p-2 rounded-lg line-clamp-2 italic text-slate-600" title={c.notes}>
                            {c.notes}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[10px]">Sem notas</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex gap-2 justify-end">
                          {canWriteClients && (
                            <button 
                              onClick={() => openForm(c)}
                              className="p-1.5 hover:bg-blue-50 hover:text-blue-700 rounded-md text-slate-500"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {c.deleted ? (
                            canWriteClients && (
                              <button
                                onClick={() => updateClient(c.id, { deleted: false })}
                                className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md text-[10px] font-bold"
                                title="Restaurar Cliente"
                              >
                                Restaurar
                              </button>
                            )
                          ) : (
                            canDeleteClients && (
                              <button 
                                onClick={() => {
                                  if (!canDeleteClients) {
                                    alert('Não tem permissão para eliminar clientes.');
                                    return;
                                  }
                                  askConfirmation(
                                    'Confirmar Eliminação de Cliente',
                                    'Tem a certeza que deseja eliminar este cliente? O registo será marcado como eliminado (deleted = true) e não surgirá na lista ativa.',
                                    () => {
                                      deleteClient(c.id);
                                      if (editingId === c.id) {
                                        setIsEditing(false);
                                        setEditingId(null);
                                      }
                                    }
                                  );
                                }}
                                className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-md text-slate-500"
                                title="Eliminar (Soft Delete)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {filteredClients.length > 0 && (
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-xs text-slate-500 font-semibold">
                <span>Mostrar</span>
                <select 
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="p-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>registos</span>
              </div>

              <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                <div className="hidden sm:block">
                  A mostrar <span className="font-bold text-slate-700">{Math.min(startIndex + 1, totalFiltered)}</span> a{' '}
                  <span className="font-bold text-slate-700">{Math.min(startIndex + pageSize, totalFiltered)}</span> de{' '}
                  <span className="font-bold text-slate-700">{totalFiltered}</span> clientes
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold transition-colors"
                  >
                    Anterior
                  </button>
                  <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700">
                    {currentPage} / {totalPages || 1}
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold transition-colors"
                  >
                    Seguinte
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />

      {/* PROJECTS MODAL */}
      {selectedClientForModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in p-4" id="client-projects-modal">
          <div className="bg-white rounded-2xl border border-slate-200 -xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building className="w-4 h-4 text-slate-500" />
                  Projetos de {selectedClientForModal.clientName}
                </h3>
                <p className="text-[10px] text-slate-400 font-medium">Selecione um projeto para abrir os seus detalhes.</p>
              </div>
              <button 
                onClick={() => setSelectedClientForModal(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                id="close-client-projects-modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Projects List */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Client Info Summary */}
              <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 font-medium text-slate-600">
                  <div><span className="text-slate-400 font-normal">NIF:</span> <span className="font-mono font-bold text-slate-700">{selectedClientForModal.taxId || 'S/NIF'}</span></div>
                  <div><span className="text-slate-400 font-normal">Pessoa Contacto:</span> <span className="font-bold text-slate-700">{selectedClientForModal.contactPerson || 'S/Contacto'}</span></div>
                  {selectedClientForModal.contactPhone && <div><span className="text-slate-400 font-normal">Tel:</span> <span className="font-bold text-slate-700">{selectedClientForModal.contactPhone}</span></div>}
                </div>
                {selectedClientForModal.notes && (
                  <div className="pt-2 border-t border-slate-200/60 text-slate-600 italic">
                    <span className="font-bold not-italic text-slate-500">Notas:</span> {selectedClientForModal.notes}
                  </div>
                )}
              </div>

              {(() => {
                const clientProjects = (projects || []).filter(p => !p.deleted && p.clientId === selectedClientForModal.id);
                const totalProjects = clientProjects.length;

                if (totalProjects === 0) {
                  return (
                    <div className="text-center py-8 text-slate-400 font-medium text-xs">
                      Este cliente não tem nenhum projeto associado.
                    </div>
                  );
                }

                const itemsPerPage = 10;
                const totalPages = Math.ceil(totalProjects / itemsPerPage);
                const startIndex = (projectsCurrentPage - 1) * itemsPerPage;
                const paginatedProjects = clientProjects.slice(startIndex, startIndex + itemsPerPage);

                return (
                  <div className="space-y-4 text-xs">
                    <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/20">
                      {paginatedProjects.map(proj => (
                        <button
                          key={proj.id}
                          onClick={() => {
                            if (onSelectProject) {
                              onSelectProject(proj.id);
                            }
                            setSelectedClientForModal(null);
                          }}
                          className="w-full p-3.5 text-left hover:bg-slate-50 flex items-center justify-between transition-colors group"
                        >
                          <div className="space-y-0.5">
                            <div className="font-extrabold text-slate-800 text-xs group-hover:text-blue-600 transition-colors">
                              {proj.title}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate max-w-md font-medium">
                              {proj.description || 'Sem descrição'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold uppercase font-mono tracking-tight">
                              {proj.startDate ? new Date(proj.startDate).toLocaleDateString('pt-PT') : 'S/Data'}
                            </span>
                            <span className="text-[10px] text-slate-300 group-hover:text-blue-600 transition-colors font-bold">→</span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-3 text-xs font-semibold text-slate-500">
                        <div>
                          A mostrar <span className="font-bold text-slate-700">{startIndex + 1}</span> a{' '}
                          <span className="font-bold text-slate-700">
                            {Math.min(startIndex + itemsPerPage, totalProjects)}
                          </span>{' '}
                          de <span className="font-bold text-slate-700">{totalProjects}</span> projetos
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={projectsCurrentPage === 1}
                            onClick={() => setProjectsCurrentPage(prev => Math.max(1, prev - 1))}
                            className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold"
                          >
                            Anterior
                          </button>
                          <span className="px-2 font-bold text-slate-700">
                            {projectsCurrentPage} / {totalPages}
                          </span>
                          <button
                            type="button"
                            disabled={projectsCurrentPage === totalPages}
                            onClick={() => setProjectsCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold"
                          >
                            Seguinte
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

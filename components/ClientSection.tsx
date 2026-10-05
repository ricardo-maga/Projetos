'use client';

import React, { useState } from 'react';
import { Client } from '../lib/types';
import { Plus, Search, Edit2, Trash2, Building, Mail, Phone, MapPin, Hash, X, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

import { hasPermission } from '../lib/permissions';
import { M3SectionHeader } from './M3';
import { Card } from './ui/Card';
import { Select } from './ui/Select';
import { Dialog } from './ui/Dialog';

// UI Foundation Components
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Badge from './ui/Badge';

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


  const activeClients = (clients || []).filter(c => c && (showDeleted ? Boolean(c.deleted) : !c.deleted));

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

  const handleSubmit = async (e: React.FormEvent) => {
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

    try {
      if (editingId) {
        await updateClient(editingId, payload);
      } else {
        await addClient(payload);
      }
      setIsEditing(false);
    } catch (err) {
      // Error handled in useERP
    }
  };

  return (
    <div className="space-y-6">
      {isEditing ? (
        <form onSubmit={handleSubmit} className="m3-card p-6 space-y-6 animate-fade-in text-body-sm font-bold text-text-secondary">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-border-subtle">
            <M3SectionHeader title={editingId ? 'Editar cliente' : 'Novo cliente'} />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-text-muted bg-surface hover:bg-surface-muted border border-border-subtle rounded-control font-semibold transition-colors"
              >
                Cancelar
              </Button>
              <Button variant="primary" size="sm"
                type="submit"
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white hover:bg-primary font-bold rounded-control text-body-sm shadow-sm transition-colors"
              >
                <Save className="w-3.5 h-3.5" /> Gravar Cliente
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1">
              <Input label="Nome da Empresa / Cliente *"

                type="text"
                required
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Ex: Alimentos Gourmet, S.A."
                className=""
              />
            </div>

            <div className="space-y-1">
              <Input label="Abreviatura / Nome Curto *"

                type="text"
                required
                value={formShortName}
                onChange={e => setFormShortName(e.target.value)}
                placeholder="Ex: AGourmet"
                className=""
              />
            </div>

            <div className="space-y-1">
              <Input label="NIF / Número Contribuinte (Tax ID)"

                type="text"
                value={formTaxId}
                onChange={e => setFormTaxId(e.target.value)}
                placeholder="Ex: PT 502948293"
                className="font-mono"
              />
            </div>

            <div className="space-y-1">
              <Input label="Localização / Morada Principal"

                type="text"
                value={formLocation}
                onChange={e => setFormLocation(e.target.value)}
                placeholder="Ex: Zona Industrial de Aveiro, Lote 4"
                className=""
              />
            </div>

            <div className="space-y-1">
              <Input label="Pessoa de Contacto (Gestor de Compras)"

                type="text"
                value={formContactPerson}
                onChange={e => setFormContactPerson(e.target.value)}
                placeholder="Ex: Eng. Carlos Gomes"
                className=""
              />
            </div>

            <div className="space-y-1">
              <Input label="E-mail de Contacto"

                type="email"
                value={formContactEmail}
                onChange={e => setFormContactEmail(e.target.value)}
                placeholder="Ex: compras@agourmet.pt"
                className="font-mono"
              />
            </div>

            <div className="space-y-1">
              <Input label="Telemóvel / Telefone Contacto"

                type="text"
                value={formContactPhone}
                onChange={e => setFormContactPhone(e.target.value)}
                placeholder="Ex: +351 912 345 678"
                className=""
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Textarea label="Notas / Observações"

                rows={3}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Observações internas, especificações ou acordos com o cliente..."
                className=""
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-border-subtle">
            <Button variant="outline" size="sm"
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-5 py-2.5 bg-surface hover:bg-surface-muted text-text-secondary font-bold rounded-control border border-border-subtle"
            >
              Cancelar
            </Button>
            <Button variant="primary" size="sm"
              type="submit"
              className="px-6 py-2.5 bg-primary text-white font-bold rounded-control hover:bg-primary -sm"
            >
              Gravar Cliente
            </Button>
          </div>
        </form>
      ) : (
        <Card className="overflow-hidden animate-fade-in">
          <div className="p-4 sm:p-5 border-b border-border/80 bg-surface-muted/60 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <M3SectionHeader title="Lista de clientes" description="Consulta e pesquisa de clientes, contactos fiscais e operacionais." />
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button
                  type="button"
                  variant={showDeleted ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowDeleted(!showDeleted);
                    setCurrentPage(1);
                  }}
                >
                  {showDeleted ? 'Ver Clientes Ativos' : 'Reciclagem'}
                </Button>
                {canWriteClients && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => openForm(null)}
                  >
                    <Plus className="w-4 h-4 mr-1 shrink-0" /> Registar Cliente
                  </Button>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none z-10" />
              <Input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Pesquisar por nome, abreviatura, contacto ou notas..."
                aria-label="Pesquisar clientes"
                className="pl-10 text-body-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            {filteredClients.length === 0 ? (
              <div className="p-10 text-center text-text-muted font-medium text-body-sm">
                {showDeleted ? 'Nenhum cliente eliminado encontrado.' : 'Nenhum cliente registado ou encontrado.'}
              </div>
            ) : (
              <table className="w-full min-w-[750px] text-left border-collapse">
                <thead className="bg-surface/90 text-caption uppercase tracking-wider text-text-muted font-bold border-b border-border-subtle/80 whitespace-nowrap select-none">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Cliente</th>
                    <th className="px-5 py-3.5 text-left">NIF / Tax ID</th>
                    <th className="px-5 py-3.5 text-left">Localização</th>
                    <th className="px-5 py-3.5 text-left">Pessoa de Contacto</th>
                    <th className="px-5 py-3.5 text-left">Notas</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="text-body-sm divide-y divide-border-subtle font-medium text-text-secondary">
                  {paginatedClients.map(c => (
                    <tr key={c.id} className={`hover:bg-surface/50 transition-colors ${c.deleted ? 'bg-warning/10' : ''}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${c.deleted ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}>
                            <Building className="w-4 h-4" />
                          </div>
                          <div>
                            <Button variant="ghost" size="sm"
                              type="button"
                              onClick={() => {
                                setSelectedClientForModal(c);
                                setProjectsCurrentPage(1);
                              }}
                              className="font-extrabold text-text-primary text-body hover:text-primary hover:underline px-0 h-auto min-h-9 whitespace-normal text-left justify-start"
                            >
                              {c.clientName}
                            </Button>
                            <div className="flex items-center gap-1.5">
                              <span className="text-caption text-text-muted uppercase tracking-tight font-mono">{c.shortName}</span>
                              {c.deleted && (
                                <Badge variant="warning">Eliminado</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-text-secondary">
                        {c.taxId || 'S/NIF'}
                      </td>
                      <td className="px-5 py-4 text-text-muted">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                          <span className="truncate max-w-[180px]">{c.location || 'Sem Morada'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-text-secondary font-medium">
                        <div>{c.contactPerson || 'Sem Contacto'}</div>
                        <div className="text-caption text-text-muted mt-1 flex flex-col gap-0.5">
                          {c.contactEmail && <span className="font-mono flex items-center gap-1"><Mail className="w-3 h-3" /> {c.contactEmail}</span>}
                          {c.contactPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.contactPhone}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-text-muted max-w-[200px]">
                        {c.notes ? (
                          <div className="text-caption bg-surface border border-border-subtle p-2 rounded-lg line-clamp-2 italic text-text-secondary" title={c.notes}>
                            {c.notes}
                          </div>
                        ) : (
                          <span className="text-text-disabled italic text-caption">Sem notas</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex gap-2 justify-end">
                          {canWriteClients && (
                            <IconButton variant="ghost" size="sm" aria-label="Editar cliente"
                              onClick={() => openForm(c)}
                              className="p-1.5 hover:bg-primary/10 hover:text-primary rounded-md text-text-muted"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </IconButton>
                          )}
                          {c.deleted ? (
                            canWriteClients && (
                              <Button variant="outline" size="sm"
                                onClick={async () => {
                                  await updateClient(c.id, { deleted: false });
                                }}
                                className="px-2 py-1 bg-success/10 text-success hover:bg-success/10 rounded-md text-caption font-bold cursor-pointer"
                                title="Restaurar Cliente"
                              >
                                Restaurar
                              </Button>
                            )
                          ) : (
                            canDeleteClients && (
                              <IconButton variant="ghost" size="sm" aria-label="Eliminar cliente"
                                onClick={() => {
                                  if (!canDeleteClients) {
                                    alert('Não tem permissão para eliminar clientes.');
                                    return;
                                  }
                                  askConfirmation(
                                    'Confirmar Eliminação de Cliente',
                                    'Tem a certeza que deseja eliminar este cliente? O registo será marcado como eliminado (deleted = true) e não surgirá na lista ativa.',
                                    async () => {
                                      await deleteClient(c.id);
                                      if (editingId === c.id) {
                                        setIsEditing(false);
                                        setEditingId(null);
                                      }
                                    }
                                  );
                                }}
                                className="p-1.5 hover:bg-error/10 hover:text-error rounded-md text-text-muted cursor-pointer"
                                title="Eliminar (Soft Delete)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </IconButton>
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
            <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 bg-surface/70 border-t border-border-subtle/80 text-body-sm gap-3 font-medium">
              <div className="flex items-center gap-3 text-text-muted">
                <span>
                  A mostrar <span className="font-bold text-text-secondary">{Math.min(startIndex + 1, totalFiltered)}</span> a{' '}
                  <span className="font-bold text-text-secondary">{Math.min(startIndex + pageSize, totalFiltered)}</span> de{' '}
                  <span className="font-bold text-text-secondary">{totalFiltered}</span> clientes
                </span>
                <div className="flex items-center gap-1.5 pl-3 border-l border-border-subtle">
                  <span className="text-text-muted">Por página:</span>
                  <Select aria-label="Clientes por página"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1 bg-surface border border-border-subtle rounded-lg text-body-sm font-semibold text-text-secondary outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </Select>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm"
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 bg-surface border border-border-subtle rounded-lg font-bold text-text-secondary hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Anterior</span>
                  </Button>
                  <div className="px-3 py-1.5 bg-surface border border-border-subtle rounded-lg font-bold text-text-secondary text-body-sm">
                    {currentPage} / {totalPages || 1}
                  </div>
                  <Button variant="outline" size="sm"
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="px-2.5 py-1.5 bg-surface border border-border-subtle rounded-lg font-bold text-text-secondary hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Seguinte</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
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
        <Dialog isOpen onClose={() => setSelectedClientForModal(null)} title={`Projetos de ${selectedClientForModal.clientName}`} className="max-w-2xl">
          <div id="client-projects-modal" className="space-y-4">
            <p className="text-caption text-text-secondary">Selecione um projeto para abrir os seus detalhes.</p>
              {/* Client Info Summary */}
              <div className="p-3.5 bg-surface border border-border-subtle rounded-control space-y-2 text-body-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 font-medium text-text-secondary">
                  <div><span className="text-text-muted font-normal">NIF:</span> <span className="font-mono font-bold text-text-secondary">{selectedClientForModal.taxId || 'S/NIF'}</span></div>
                  <div><span className="text-text-muted font-normal">Pessoa Contacto:</span> <span className="font-bold text-text-secondary">{selectedClientForModal.contactPerson || 'S/Contacto'}</span></div>
                  {selectedClientForModal.contactPhone && <div><span className="text-text-muted font-normal">Tel:</span> <span className="font-bold text-text-secondary">{selectedClientForModal.contactPhone}</span></div>}
                </div>
                {selectedClientForModal.notes && (
                  <div className="pt-2 border-t border-border-subtle/60 text-text-secondary italic">
                    <span className="font-bold not-italic text-text-muted">Notas:</span> {selectedClientForModal.notes}
                  </div>
                )}
              </div>

              {(() => {
                const clientProjects = (projects || []).filter(p => !p.deleted && p.clientId === selectedClientForModal.id);
                const totalProjects = clientProjects.length;

                if (totalProjects === 0) {
                  return (
                    <div className="text-center py-8 text-text-muted font-medium text-body-sm">
                      Este cliente não tem nenhum projeto associado.
                    </div>
                  );
                }

                const itemsPerPage = 10;
                const totalPages = Math.ceil(totalProjects / itemsPerPage);
                const startIndex = (projectsCurrentPage - 1) * itemsPerPage;
                const paginatedProjects = clientProjects.slice(startIndex, startIndex + itemsPerPage);

                return (
                  <div className="space-y-4 text-body-sm">
                    <div className="divide-y divide-border-subtle border border-border-subtle rounded-control overflow-hidden bg-surface/20">
                      {paginatedProjects.map(proj => (
                        <Button variant="outline" size="sm"
                          key={proj.id}
                          onClick={() => {
                            if (onSelectProject) {
                              onSelectProject(proj.id);
                            }
                            setSelectedClientForModal(null);
                          }}
                          className="w-full p-3.5 text-left hover:bg-surface flex items-center justify-between transition-colors group"
                        >
                          <div className="space-y-0.5">
                            <div className="font-extrabold text-text-primary text-body-sm group-hover:text-primary transition-colors">
                              {proj.title}
                            </div>
                            <div className="text-caption text-text-muted truncate max-w-md font-medium">
                              {proj.description || 'Sem descrição'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-caption bg-surface-muted text-text-secondary px-2 py-0.5 rounded font-bold uppercase font-mono tracking-tight">
                              {proj.startDate ? new Date(proj.startDate).toLocaleDateString('pt-PT') : 'S/Data'}
                            </span>
                            <span className="text-caption text-text-disabled group-hover:text-primary transition-colors font-bold">→</span>
                          </div>
                        </Button>
                      ))}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-3 text-body-sm font-semibold text-text-muted">
                        <div>
                          A mostrar <span className="font-bold text-text-secondary">{startIndex + 1}</span> a{' '}
                          <span className="font-bold text-text-secondary">
                            {Math.min(startIndex + itemsPerPage, totalProjects)}
                          </span>{' '}
                          de <span className="font-bold text-text-secondary">{totalProjects}</span> projetos
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm"
                            type="button"
                            disabled={projectsCurrentPage === 1}
                            onClick={() => setProjectsCurrentPage(prev => Math.max(1, prev - 1))}
                            className="px-2.5 py-1 bg-surface border border-border-subtle rounded-lg hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold"
                          >
                            Anterior
                          </Button>
                          <span className="px-2 font-bold text-text-secondary">
                            {projectsCurrentPage} / {totalPages}
                          </span>
                          <Button variant="outline" size="sm"
                            type="button"
                            disabled={projectsCurrentPage === totalPages}
                            onClick={() => setProjectsCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            className="px-2.5 py-1 bg-surface border border-border-subtle rounded-lg hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold"
                          >
                            Seguinte
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>
        </Dialog>
      )}
    </div>
  );
}

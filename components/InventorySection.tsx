'use client';

import React, { useState } from 'react';
import { Material, Equipment, Client } from '../lib/types';
import { Plus, Search, Edit2, Trash2, Package, Wrench, Shield, Key } from 'lucide-react';

interface InventorySectionProps {
  materials: Material[];
  equipment: Equipment[];
  clients: Client[];
  addMaterial: (m: any) => void;
  updateMaterial: (id: string, updates: any) => void;
  deleteMaterial: (id: string) => void;
  addEquipment: (e: any) => void;
  updateEquipment: (id: string, updates: any) => void;
  deleteEquipment: (id: string) => void;
}

export default function InventorySection({
  materials,
  equipment,
  clients,
  addMaterial,
  updateMaterial,
  deleteMaterial,
  addEquipment,
  updateEquipment,
  deleteEquipment,
}: InventorySectionProps) {
  const [subTab, setSubTab] = useState<'materials' | 'equipment'>('materials');
  const [search, setSearch] = useState('');

  // Material Form
  const [isEditingMaterial, setIsEditingMaterial] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [mName, setMName] = useState('');
  const [mRef, setMRef] = useState('');
  const [mManRef, setMManRef] = useState('');
  const [mUnit, setMUnit] = useState('un');
  const [mCost, setMCost] = useState(0);
  const [mSupplier, setMSupplier] = useState('');

  // Equipment Form
  const [isEditingEq, setIsEditingEq] = useState(false);
  const [editingEqId, setEditingEqId] = useState<string | null>(null);
  const [eqSerial, setEqSerial] = useState('');
  const [eqBrand, setEqBrand] = useState('');
  const [eqModel, setEqModel] = useState('');
  const [eqClient, setEqClient] = useState('');
  const [eqStatus, setEqStatus] = useState('In Operation');
  const [eqInstallDate, setEqInstallDate] = useState('');

  // Materials filter
  const activeMaterials = materials.filter(m => !m.deleted);
  const filteredMaterials = activeMaterials.filter(m => {
    return m.name.toLowerCase().includes(search.toLowerCase()) || 
           m.reference.toLowerCase().includes(search.toLowerCase()) ||
           m.supplier.toLowerCase().includes(search.toLowerCase());
  });

  // Equipment filter
  const activeEq = equipment.filter(e => !e.deleted);
  const filteredEq = activeEq.filter(e => {
    return e.serialNumber.toLowerCase().includes(search.toLowerCase()) || 
           e.brand.toLowerCase().includes(search.toLowerCase()) ||
           e.model.toLowerCase().includes(search.toLowerCase());
  });

  const openMaterialForm = (m: Material | null) => {
    if (m) {
      setEditingMaterialId(m.id);
      setMName(m.name);
      setMRef(m.reference);
      setMManRef(m.manufacturerReference);
      setMUnit(m.unit);
      setMCost(m.unitCost);
      setMSupplier(m.supplier);
    } else {
      setEditingMaterialId(null);
      setMName('');
      setMRef('');
      setMManRef('');
      setMUnit('un');
      setMCost(0);
      setMSupplier('');
    }
    setIsEditingMaterial(true);
  };

  const handleMaterialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: mName,
      reference: mRef,
      manufacturerReference: mManRef,
      unit: mUnit,
      unitCost: Number(mCost),
      supplier: mSupplier,
    };

    if (editingMaterialId) {
      updateMaterial(editingMaterialId, payload);
    } else {
      addMaterial(payload);
    }
    setIsEditingMaterial(false);
  };

  const openEqForm = (eq: Equipment | null) => {
    if (eq) {
      setEditingEqId(eq.id);
      setEqSerial(eq.serialNumber);
      setEqBrand(eq.brand);
      setEqModel(eq.model);
      setEqClient(eq.projectIdOrClientId || eq.clientId || eq.projectId || '');
      setEqStatus(eq.status);
      setEqInstallDate(eq.installationDate);
    } else {
      setEditingEqId(null);
      setEqSerial('');
      setEqBrand('');
      setEqModel('');
      setEqClient(clients[0]?.id || '');
      setEqStatus('In Operation');
      setEqInstallDate('');
    }
    setIsEditingEq(true);
  };

  const handleEqSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      serialNumber: eqSerial,
      brand: eqBrand,
      model: eqModel,
      projectIdOrClientId: eqClient,
      status: eqStatus,
      installationDate: eqInstallDate,
    };

    if (editingEqId) {
      updateEquipment(editingEqId, payload);
    } else {
      addEquipment(payload);
    }
    setIsEditingEq(false);
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.clientName || 'Cliente';

  return (
    <div className="space-y-6">
      
      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200">
        <button 
          onClick={() => { setSubTab('materials'); setSearch(''); }}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            subTab === 'materials' 
              ? 'border-blue-600 text-blue-600 bg-blue-50/20' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Package className="w-4 h-4" /> Catálogo de Materiais & Custos
        </button>
        <button 
          onClick={() => { setSubTab('equipment'); setSearch(''); }}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            subTab === 'equipment' 
              ? 'border-blue-600 text-blue-600 bg-blue-50/20' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="w-4 h-4" /> Equipamentos & Instalações
        </button>
      </div>

      {subTab === 'materials' ? (
        // MATERIALS CATALOG SECTION
        isEditingMaterial ? (
          <form onSubmit={handleMaterialSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 -sm animate-fade-in text-xs font-bold text-slate-700">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                {editingMaterialId ? 'Editar Artigo de Catálogo' : 'Adicionar Artigo / Material de Inventário'}
              </h2>
              <button 
                type="button" 
                onClick={() => setIsEditingMaterial(false)}
                className="px-3 py-1.5 text-slate-500 bg-slate-50 border border-slate-200 rounded-xl"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1">
                <label className="block text-slate-500">Nome do Artigo / Material *</label>
                <input 
                  type="text" 
                  required
                  value={mName}
                  onChange={e => setMName(e.target.value)}
                  placeholder="Ex: Sensor Óptico de Barreira NPN"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Referência Interna / Código de Barras *</label>
                <input 
                  type="text" 
                  required
                  value={mRef}
                  onChange={e => setMRef(e.target.value)}
                  placeholder="Ex: SEN-BAR-092"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Referência do Fabricante</label>
                <input 
                  type="text" 
                  value={mManRef}
                  onChange={e => setMManRef(e.target.value)}
                  placeholder="Ex: E3Z-D61 2M"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Unidade de Medida *</label>
                <input 
                  type="text" 
                  required
                  value={mUnit}
                  onChange={e => setMUnit(e.target.value)}
                  placeholder="Ex: un, m, kg, rolo"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Custo Unitário (€) *</label>
                <input 
                  type="number" 
                  required
                  step="0.01"
                  value={mCost}
                  onChange={e => setMCost(Number(e.target.value))}
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Fornecedor / Fabricante Principal</label>
                <input 
                  type="text" 
                  value={mSupplier}
                  onChange={e => setMSupplier(e.target.value)}
                  placeholder="Ex: Omron, Schneider, RS Components"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setIsEditingMaterial(false)}
                className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 -sm"
              >
                Gravar Artigo
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 -sm overflow-hidden animate-fade-in text-xs font-bold text-slate-700">
            
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Catálogo Global de Artigos & Peças</h2>
                  <p className="text-xs text-slate-500">Referências registadas para incorporação em propostas comerciais (BOM).</p>
                </div>
                <button 
                  onClick={() => openMaterialForm(null)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl -sm self-start md:self-auto"
                >
                  <Plus className="w-4 h-4" /> Registar Artigo
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Procurar por nome do material, referência ou fornecedor..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredMaterials.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-medium text-xs">Nenhum material registado.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">Artigo / Nome</th>
                      <th className="px-5 py-3">Código Interno</th>
                      <th className="px-5 py-3">Ref. Fabricante</th>
                      <th className="px-5 py-3">Fornecedor</th>
                      <th className="px-5 py-3 text-right">Custo Unitário</th>
                      <th className="px-5 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredMaterials.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-extrabold text-slate-800 text-sm">{m.name}</div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">Medida: por {m.unit}</div>
                        </td>
                        <td className="px-5 py-4 font-mono font-bold text-slate-700">{m.reference}</td>
                        <td className="px-5 py-4 font-mono text-slate-500">{m.manufacturerReference || 'N/A'}</td>
                        <td className="px-5 py-4 text-slate-600">{m.supplier}</td>
                        <td className="px-5 py-4 text-right font-extrabold text-slate-950 font-mono text-sm">
                          {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(m.unitCost)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button 
                              onClick={() => openMaterialForm(m)}
                              className="p-1.5 hover:bg-blue-50 hover:text-blue-700 rounded-md text-slate-500"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => {
                                if (confirm('Eliminar este artigo do catálogo?')) {
                                  deleteMaterial(m.id);
                                }
                              }}
                              className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-md text-slate-500"
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
          </div>
        )
      ) : (
        // EQUIPMENT TRACKER SECTION
        isEditingEq ? (
          <form onSubmit={handleEqSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 -sm animate-fade-in text-xs font-bold text-slate-700">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                {editingEqId ? 'Editar Registo de Equipamento' : 'Instalar / Registar Equipamento de Campo'}
              </h2>
              <button 
                type="button" 
                onClick={() => setIsEditingEq(false)}
                className="px-3 py-1.5 text-slate-500 bg-slate-50 border border-slate-200 rounded-xl"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1">
                <label className="block text-slate-500">Número de Série (Serial Number) *</label>
                <input 
                  type="text" 
                  required
                  value={eqSerial}
                  onChange={e => setEqSerial(e.target.value)}
                  placeholder="Ex: S/N-92849204A"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Marca *</label>
                <input 
                  type="text" 
                  required
                  value={eqBrand}
                  onChange={e => setEqBrand(e.target.value)}
                  placeholder="Ex: Festo, Siemens"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Modelo *</label>
                <input 
                  type="text" 
                  required
                  value={eqModel}
                  onChange={e => setEqModel(e.target.value)}
                  placeholder="Ex: VUVG-L10-M52-R-M7"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Cliente Recipiente / Destino *</label>
                <select 
                  value={eqClient}
                  onChange={e => setEqClient(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
                >
                  {clients.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Estado de Operação *</label>
                <select 
                  value={eqStatus}
                  onChange={e => setEqStatus(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
                >
                  <option value="In Operation">In Operation (Em Funcionamento)</option>
                  <option value="Maintenance">Maintenance (Em Manutenção)</option>
                  <option value="Off">Off (Desligado)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Data de Instalação</label>
                <input 
                  type="date" 
                  value={eqInstallDate}
                  onChange={e => setEqInstallDate(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setIsEditingEq(false)}
                className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 -sm"
              >
                Gravar Equipamento
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 -sm overflow-hidden animate-fade-in text-xs font-bold text-slate-700">
            
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Parque de Equipamentos Instalados</h2>
                  <p className="text-xs text-slate-500">Gestão e rastreabilidade de máquinas, números de série e marca nos clientes.</p>
                </div>
                <button 
                  onClick={() => openEqForm(null)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl -sm self-start md:self-auto"
                >
                  <Plus className="w-4 h-4" /> Registar Equipamento
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar por S/N, marca ou modelo de equipamento..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredEq.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-medium text-xs">Nenhum equipamento industrial registado.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">Número de Série (S/N)</th>
                      <th className="px-5 py-3">Marca / Modelo</th>
                      <th className="px-5 py-3">Instalado no Cliente</th>
                      <th className="px-5 py-3">Data de Instalação</th>
                      <th className="px-5 py-3">Estado</th>
                      <th className="px-5 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredEq.map(e => (
                      <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4 font-mono font-bold text-slate-800 text-sm flex items-center gap-2">
                          <Shield className="w-4 h-4 text-emerald-500" />
                          {e.serialNumber}
                        </td>
                        <td className="px-5 py-4 font-medium text-slate-800">
                          <span className="font-extrabold">{e.brand}</span>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{e.model}</div>
                        </td>
                        <td className="px-5 py-4 text-blue-600 font-bold">{getClientName(e.projectIdOrClientId || e.clientId || e.projectId || '')}</td>
                        <td className="px-5 py-4 text-slate-500 font-mono font-semibold">{e.installationDate || 'N/A'}</td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            e.status === 'In Operation' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            e.status === 'Maintenance' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button 
                              onClick={() => openEqForm(e)}
                              className="p-1.5 hover:bg-blue-50 hover:text-blue-700 rounded-md text-slate-500"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => {
                                if (confirm('Eliminar este registo de equipamento?')) {
                                  deleteEquipment(e.id);
                                }
                              }}
                              className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-md text-slate-500"
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
          </div>
        )
      )}

    </div>
  );
}

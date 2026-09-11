'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { UserAbsence, SpecialDay } from '../lib/types';
import { Plus, Trash2, Calendar, Users, UserCheck, AlertCircle, Edit2, ChevronLeft, ChevronRight, ArrowUpDown, Filter, Shield } from 'lucide-react';
import { hashPassword } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import { getGroupPermissions, hasPermission } from '../lib/permissions';

interface UserSectionProps {
  absences: UserAbsence[];
  users: any[];
  userGroups: any[];
  addAbsence: (abs: any) => void;
  deleteAbsence: (id: string) => void;
  addUser: (user: any) => void;
  updateUser: (id: string, updates: any) => void;
  deleteUser: (id: string) => void;
  hideAbsences?: boolean;
  hideUsers?: boolean;
  specialDays?: SpecialDay[];
  updateAuxRecord?: (tableName: any, id: string, updates: any) => void;
  currentUser?: any;
}

export default function UserSection({
  absences,
  users,
  userGroups,
  addAbsence,
  deleteAbsence,
  addUser,
  updateUser,
  deleteUser,
  hideAbsences = false,
  hideUsers = false,
  specialDays = [],
  updateAuxRecord,
  currentUser,
}: UserSectionProps) {
  const canReadAbsences = hasPermission(currentUser, 'absences_read', userGroups);
  const canWriteAbsences = hasPermission(currentUser, 'absences_write', userGroups);
  const canDeleteAbsences = hasPermission(currentUser, 'absences_delete', userGroups);

  const canReadUsers = hasPermission(currentUser, 'users_read', userGroups);
  const canWriteUsers = hasPermission(currentUser, 'users_write', userGroups);
  const canDeleteUsers = hasPermission(currentUser, 'users_delete', userGroups);

  const canWriteConfig = hasPermission(currentUser, 'config_write', userGroups);
  const [subTab, setSubTab] = useState<'absences' | 'users' | 'permissions'>(hideAbsences ? 'users' : 'absences');
  const [filterGroupId, setFilterGroupId] = useState<string>('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

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

  // Absence Form State
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('Vacation');

  // Absence Filters & Sorting States
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterUserId, setFilterUserId] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Calendar State
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(() => new Date());

  // User Form State
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uPasswordConfirm, setUPasswordConfirm] = useState('');
  const [uRoleId, setURoleId] = useState(userGroups?.[0]?.id || 'ug-3');
  const [uType, setUType] = useState<'Team' | 'Sales' | 'Admin' | 'External' | 'Other'>('Team');
  const [uIsAdmin, setUIsAdmin] = useState(false);

  const handleAddAbsenceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteAbsences) {
      alert('Não tem permissão para registar ausências.');
      return;
    }
    const activeUserId = userId || users.find(u => !u.deleted)?.id || '';
    if (!activeUserId || !startDate || !endDate) {
      alert('Por favor, preencha todos os campos da ausência.');
      return;
    }

    if (startDate > endDate) {
      alert('A data de início não pode ser posterior à data de fim.');
      return;
    }

    // Overlap / Collision check for the selected user
    const hasOverlap = absences.some(abs => {
      if (abs.userId !== activeUserId) return false;
      // Intersection formula: start1 <= end2 && end1 >= start2
      return (startDate <= abs.absenceEndDate) && (endDate >= abs.absenceStartDate);
    });

    if (hasOverlap) {
      const confirmSave = window.confirm(
        'Atenção: O período ou dia selecionado colide com outra ausência já registada para este utilizador. Deseja mesmo gravar esta ausência?'
      );
      if (!confirmSave) return;
    }

    addAbsence({
      userId: activeUserId,
      absenceStartDate: startDate,
      absenceEndDate: endDate,
      reason,
    });
    setStartDate('');
    setEndDate('');
  };

  const startAddUser = () => {
    setEditingUser(null);
    setUName('');
    setUEmail('');
    setUPassword('');
    setUPasswordConfirm('');
    setURoleId(userGroups?.[0]?.id || 'ug-3');
    setUType('Team');
    setUIsAdmin(false);
    setIsAddingUser(true);
  };

  const startEditUser = (user: any) => {
    setIsAddingUser(false);
    setEditingUser(user);
    setUName(user.name);
    setUEmail(user.email);
    setUPassword('');
    setUPasswordConfirm('');
    setURoleId(user.roleId || userGroups?.[0]?.id || 'ug-3');
    setUType(user.type || 'Team');
    setUIsAdmin(!!user.isAdmin);
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteUsers) {
      alert('Não tem permissão para criar utilizadores.');
      return;
    }
    if (!uName || !uEmail) {
      alert('Por favor, preencha o nome e email do utilizador.');
      return;
    }
    if (!uPassword) {
      alert('Por favor, defina uma password para o novo utilizador.');
      return;
    }
    if (uPassword !== uPasswordConfirm) {
      alert('As passwords introduzidas não coincidem.');
      return;
    }
    const hashedPassword = await hashPassword(uPassword);
    addUser({
      name: uName,
      email: uEmail,
      password: hashedPassword,
      roleId: uRoleId,
      type: uType,
      approved: true,
      isAdmin: uIsAdmin,
    });
    setUName('');
    setUEmail('');
    setUPassword('');
    setUPasswordConfirm('');
    setUIsAdmin(false);
    setIsAddingUser(false);
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteUsers) {
      alert('Não tem permissão para editar utilizadores.');
      return;
    }
    if (!editingUser) return;
    if (!uName || !uEmail) {
      alert('Por favor, preencha o nome e email do utilizador.');
      return;
    }

    const updates: any = {
      name: uName,
      email: uEmail,
      roleId: uRoleId,
      type: uType,
      isAdmin: uIsAdmin,
    };

    if (uPassword) {
      if (uPassword !== uPasswordConfirm) {
        alert('As passwords introduzidas não coincidem.');
        return;
      }
      updates.password = await hashPassword(uPassword);
    }

    updateUser(editingUser.id, updates);
    setUName('');
    setUEmail('');
    setUPassword('');
    setUPasswordConfirm('');
    setEditingUser(null);
  };

  const matchUserId = (idA: string, idB: string) => {
    if (!idA || !idB) return false;
    if (idA === idB) return true;
    const mappings: Record<string, string> = {
      'u-1': '11111111-1111-1111-1111-111111111111',
      'u-2': '11111111-1111-1111-1111-111111111112',
      'u-3': '11111111-1111-1111-1111-111111111113',
      'u-4': '11111111-1111-1111-1111-111111111114',
      'u-5': '11111111-1111-1111-1111-111111111115',
    };
    const normA = mappings[idA] || idA;
    const normB = mappings[idB] || idB;
    return normA === normB;
  };

  const getUserName = (id: string) => users.find(u => matchUserId(u.id, id))?.name || 'Utilizador';
  const getUserInitials = (name: string) => {
    return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const getGroupName = (roleId: string) => {
    return userGroups?.find(g => g.id === roleId)?.name || 'Sem Grupo';
  };

  const getTranslatedReason = (r: string) => {
    switch (r) {
      case 'Vacation': return 'Férias';
      case 'Sick leave': return 'Baixa Médica';
      case 'Other': return 'Outro';
      default: return r;
    }
  };

  const calculateDays = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    
    // Normalize to midnight UTC to ensure consistency
    const sUtc = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
    const eUtc = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
    
    const diffTime = eUtc - sUtc;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 0;
  };

  const getUserColorClass = (uid: string) => {
    const colors = [
      'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
      'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
      'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
      'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
      'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
      'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100',
      'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
      'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
    ];
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
      hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const years = useMemo(() => {
    const yearsSet = new Set<string>();
    const currentYear = new Date().getFullYear().toString();
    yearsSet.add(currentYear);
    absences.forEach(abs => {
      if (abs.absenceStartDate) {
        const startYear = abs.absenceStartDate.split('-')[0];
        if (startYear && startYear.length === 4) yearsSet.add(startYear);
      }
      if (abs.absenceEndDate) {
        const endYear = abs.absenceEndDate.split('-')[0];
        if (endYear && endYear.length === 4) yearsSet.add(endYear);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [absences]);

  const processedAbsences = useMemo(() => {
    let list = [...absences];

    // Filter by User
    if (filterUserId !== 'all') {
      list = list.filter(abs => abs.userId === filterUserId);
    }

    // Filter by Year (any overlap with that year)
    if (filterYear !== 'all') {
      const yearStart = `${filterYear}-01-01`;
      const yearEnd = `${filterYear}-12-31`;
      list = list.filter(abs => abs.absenceStartDate <= yearEnd && abs.absenceEndDate >= yearStart);
    }

    // Sort by registration date to get the 25 most recently registered first
    list.sort((a, b) => {
      const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
      const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
      return dateB - dateA;
    });

    let limitedList = list.slice(0, 25);

    // Sort by start date depending on sortOrder
    limitedList.sort((a, b) => {
      const dateA = a.absenceStartDate || '';
      const dateB = b.absenceStartDate || '';
      if (sortOrder === 'asc') {
        return dateA.localeCompare(dateB);
      } else {
        return dateB.localeCompare(dateA);
      }
    });

    return limitedList;
  }, [absences, filterUserId, filterYear, sortOrder]);

  const activeGroups = useMemo(() => userGroups.filter(g => !g.deleted), [userGroups]);
  const activeSelectedGroupId = selectedGroupId || activeGroups[0]?.id || '';

  const group = activeGroups.find(g => g.id === activeSelectedGroupId);
  const permissions = group ? getGroupPermissions(group.id, userGroups) : null;

  const handleTogglePermission = (key: string) => {
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as permissões de grupo.');
      return;
    }
    if (!updateAuxRecord || !group) return;
    const currentPerms = group.permissions ? (typeof group.permissions === 'string' ? JSON.parse(group.permissions) : group.permissions) : {};
    const updated = {
      ...currentPerms,
      [key]: !currentPerms[key]
    };
    updateAuxRecord('userGroups', group.id, { permissions: updated });
  };

  return (
    <div className="space-y-6">
      
      {/* Sub Tabs */}
      {!hideAbsences && !hideUsers ? (
        <div className="flex border-b border-slate-200">
          <button 
            onClick={() => setSubTab('absences')}
            className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              subTab === 'absences' 
                ? 'border-blue-600 text-blue-600 bg-blue-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" /> Registo de ausências
          </button>
          <button 
            onClick={() => setSubTab('users')}
            className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              subTab === 'users' 
                ? 'border-blue-600 text-blue-600 bg-blue-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" /> Utilizadores
          </button>
          <button 
            onClick={() => setSubTab('permissions')}
            className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              subTab === 'permissions' 
                ? 'border-blue-600 text-blue-600 bg-blue-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="w-4 h-4" /> Grupos e Permissões
          </button>
        </div>
      ) : hideAbsences ? (
        <div className="flex border-b border-slate-200">
          <button 
            onClick={() => setSubTab('users')}
            className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              subTab === 'users' 
                ? 'border-blue-600 text-blue-600 bg-blue-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" /> Utilizadores
          </button>
          <button 
            onClick={() => setSubTab('permissions')}
            className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              subTab === 'permissions' 
                ? 'border-blue-600 text-blue-600 bg-blue-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="w-4 h-4" /> Grupos e Permissões
          </button>
        </div>
      ) : null}

      {subTab === 'absences' && (
        <div className="space-y-6">
          {/* Top Row: Form & Calendar */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            
            {/* Add Absence Form */}
            <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 -sm h-fit">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-blue-600" />
                Marcar Ausência
              </h3>
              
              <form onSubmit={handleAddAbsenceSubmit} className="space-y-4 text-xs font-bold text-slate-700">
                <div className="space-y-1">
                  <label className="block text-slate-500">Utilizador *</label>
                  <select 
                    value={userId || users.find(u => !u.deleted)?.id || ''}
                    onChange={e => setUserId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold text-xs"
                  >
                    {users
                      .filter(u => !u.deleted)
                      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }))
                      .map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({getGroupName(u.roleId)})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">Data de Início *</label>
                  <input 
                    type="date" 
                    required
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">Data de fim *</label>
                  <input 
                    type="date" 
                    required
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">Motivo *</label>
                  <select 
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold text-xs"
                  >
                    <option value="Vacation">Ausente</option>
                    <option value="Other">Outro</option>
                  </select>
                </div>

                <button 
                  type="submit"
                  className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors -sm mt-2"
                >
                  Gravar Ausência
                </button>
              </form>
            </div>

            {/* Monthly Calendar View */}
            <div className="xl:col-span-8 bg-white rounded-2xl border border-slate-200 -sm p-6 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Calendário Mensal de Ausências Completo
                </h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  Visualização geral do pessoal ausente por dia de trabalho
                </p>
              </div>

              {/* Calendar Navigator */}
              <div className="flex items-center gap-2 select-none">
                <button
                  onClick={() => setCurrentCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-600 transition-colors cursor-pointer"
                  title="Mês anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-slate-700 min-w-[130px] text-center uppercase tracking-wider">
                  {new Intl.DateTimeFormat('pt', { month: 'long', year: 'numeric' }).format(currentCalendarDate)}
                </span>
                <button
                  onClick={() => setCurrentCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-600 transition-colors cursor-pointer"
                  title="Mês seguinte"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentCalendarDate(new Date())}
                  className="px-2.5 py-1 hover:bg-slate-100 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 transition-colors ml-1 cursor-pointer"
                >
                  Hoje
                </button>
              </div>
            </div>

            {/* Continuous, table-like Calendar Grid */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden -sm">
              <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase text-center select-none">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                  <div key={d} className="py-2 border-r border-slate-100 last:border-0">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 text-xs">
                {(() => {
                  const year = currentCalendarDate.getFullYear();
                  const month = currentCalendarDate.getMonth();

                  const firstDayInstance = new Date(year, month, 1);
                  const startingDayOfWeek = firstDayInstance.getDay(); // 0 = Sun, 1 = Mon, etc.
                  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

                  const cells = [];

                  // Empty cells for the start of the month (preceding month empty slots)
                  for (let i = 0; i < startingDayOfWeek; i++) {
                    cells.push(
                      <div key={`empty-${i}`} className="min-h-[80px] p-2 border-b border-r border-slate-100 bg-slate-50/50"></div>
                    );
                  }

                  const todayStr = new Date().toISOString().split('T')[0];

                  // Active month days
                  for (let d = 1; d <= totalDaysInMonth; d++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const currentDate = new Date(year, month, d);
                    const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
                    const specialDay = specialDays.find(sd => sd.date === dateStr);
                    const isSpecial = !!specialDay;

                    const dayAbsences = absences.filter(abs => {
                      return abs.absenceStartDate <= dateStr && abs.absenceEndDate >= dateStr;
                    });
                    const isToday = dateStr === todayStr;

                    cells.push(
                      <div 
                        key={`day-${d}`} 
                        className={`min-h-[80px] p-1.5 border-b border-r border-slate-100 relative transition-colors hover:bg-slate-100/50 flex flex-col justify-between ${
                          isWeekend || isSpecial ? 'bg-slate-100/60' : 'bg-white'
                        }`}
                      >
                        {/* Cell Header */}
                        <div className="flex justify-between items-start mb-1 select-none">
                          <span className={`inline-block w-5 h-5 text-center leading-5 rounded-full font-bold text-[11px] ${
                            isToday ? 'bg-amber-500 text-white -sm font-black' : 'text-slate-650'
                          }`}>
                            {d}
                          </span>
                          {specialDay && (
                            <span 
                              className="text-[8px] font-extrabold text-rose-700 bg-rose-50 border border-rose-100/50 px-1 py-0.5 rounded truncate max-w-[50px]" 
                              title={specialDay.name}
                            >
                              {specialDay.name}
                            </span>
                          )}
                        </div>

                        {/* Absent Users List */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {dayAbsences.map(abs => {
                            const initials = getUserInitials(getUserName(abs.userId));
                            const colorClass = getUserColorClass(abs.userId);
                            return (
                              <span
                                key={abs.id}
                                className={`inline-flex items-center justify-center w-5 h-5 text-[9px] font-bold rounded-full border -sm transition-all cursor-help ${colorClass}`}
                                title={`${getUserName(abs.userId)} (Ausente: ${abs.absenceStartDate} a ${abs.absenceEndDate})`}
                              >
                                {initials}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // Empty cells for the end of the month to complete the last row
                  const totalGridCells = startingDayOfWeek + totalDaysInMonth;
                  const remainingPadding = totalGridCells % 7 === 0 ? 0 : 7 - (totalGridCells % 7);
                  for (let i = 0; i < remainingPadding; i++) {
                    cells.push(
                      <div key={`empty-end-${i}`} className="min-h-[80px] p-2 border-b border-r border-slate-100 bg-slate-50/50"></div>
                    );
                  }

                  return cells;
                })()}
              </div>
            </div>
          </div>
          </div>

          {/* Absences List Table with Filters & Sorting */}
          <div className="bg-white rounded-2xl border border-slate-200 -sm overflow-hidden text-xs">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="font-bold text-slate-800">Registo de ausências</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">Últimos 25 registos guardados</p>
                </div>
                
                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* User Filter */}
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                    <Filter className="w-3 h-3 text-slate-400" />
                    <select
                      value={filterUserId}
                      onChange={e => setFilterUserId(e.target.value)}
                      className="bg-transparent border-none outline-none text-[11px] font-semibold text-slate-600 cursor-pointer pr-1"
                    >
                      <option value="all">Todos os utilizadores</option>
                      {users
                        .filter(u => !u.deleted)
                        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }))
                        .map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Year Filter */}
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <select
                      value={filterYear}
                      onChange={e => setFilterYear(e.target.value)}
                      className="bg-transparent border-none outline-none text-[11px] font-semibold text-slate-600 cursor-pointer pr-1"
                    >
                      <option value="all">Todos os anos</option>
                      {years.map(y => (
                        <option key={y} value={y}>{y} {y === new Date().getFullYear().toString() ? '(Atual)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {processedAbsences.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="text-slate-400 font-medium">Nenhuma ausência encontrada com os filtros selecionados.</p>
                  {(filterUserId !== 'all' || filterYear !== 'all') && (
                    <button 
                      onClick={() => { setFilterUserId('all'); setFilterYear('all'); }}
                      className="text-blue-600 hover:underline font-bold text-[11px]"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase border-b border-slate-100 font-bold select-none">
                      <tr>
                        <th className="px-5 py-3">Utilizador</th>
                        <th 
                          className="px-5 py-3 cursor-pointer hover:text-slate-700 hover:bg-slate-100/50 transition-colors"
                          onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        >
                          <div className="flex items-center gap-1">
                            Data início
                            <ArrowUpDown className={`w-3 h-3 ${sortOrder === 'asc' ? 'text-blue-600' : 'text-slate-400'}`} />
                          </div>
                        </th>
                        <th className="px-5 py-3">Data fim</th>
                        <th className="px-5 py-3">Motivo</th>
                        <th className="px-5 py-3 text-center">Duração</th>
                        <th className="px-5 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {processedAbsences.map(abs => {
                        const totalDays = calculateDays(abs.absenceStartDate, abs.absenceEndDate);
                        return (
                          <tr key={abs.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3">
                              <span className="font-bold text-slate-900">{getUserName(abs.userId)}</span>
                            </td>
                            <td className="px-5 py-3 font-mono">{abs.absenceStartDate}</td>
                            <td className="px-5 py-3 font-mono text-blue-600 font-bold">{abs.absenceEndDate}</td>
                            <td className="px-5 py-3">
                              <span className="inline-block px-2 py-0.5 bg-slate-50 border border-slate-150 rounded text-slate-600 text-[10px]">
                                {getTranslatedReason(abs.reason || 'Other')}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-600 font-bold rounded-full text-[10px]">
                                {totalDays} {totalDays === 1 ? 'dia' : 'dias'}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button 
                                onClick={() => askConfirmation(
                                  'Confirmar Eliminação de Ausência',
                                  `Aviso: Isto irá remover permanentemente o registo de ausência de ${getUserName(abs.userId)} (${abs.absenceStartDate} a ${abs.absenceEndDate}). Pretende continuar?`,
                                  () => deleteAbsence(abs.id)
                                )}
                                className="text-red-500 hover:text-red-700 font-bold"
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="p-3 border-t border-slate-100 bg-slate-50/30 text-right text-[10px] text-slate-400 font-medium">
                    A mostrar {processedAbsences.length} {processedAbsences.length === 1 ? 'resultado' : 'resultados'}
                  </div>
                </div>
              )}
            </div>
        </div>
      )}

      {subTab === 'users' && (
        // USERS DIRECTORY SECTION
        <div className="space-y-6">
          {isAddingUser || editingUser ? (
            <form onSubmit={isAddingUser ? handleAddUserSubmit : handleEditUserSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 -sm animate-fade-in text-xs font-bold text-slate-700">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-800">
                  {isAddingUser ? 'Adicionar utilizador' : 'Editar utilizador'}
                </h2>
                <button 
                  type="button" 
                  onClick={() => {
                    setIsAddingUser(false);
                    setEditingUser(null);
                  }}
                  className="px-3 py-1.5 text-slate-500 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="block text-slate-500">Nome *</label>
                  <input 
                    type="text" 
                    required
                    value={uName}
                    onChange={e => setUName(e.target.value)}
                    placeholder="Ex: António Pereira"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">E-mail *</label>
                  <input 
                    type="email" 
                    required
                    value={uEmail}
                    onChange={e => setUEmail(e.target.value)}
                    placeholder="Ex: apereira@email.pt"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">Password {isAddingUser ? '*' : '(Deixe em branco para manter a atual)'}</label>
                  <input 
                    type="password" 
                    required={isAddingUser}
                    value={uPassword}
                    onChange={e => setUPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">Confirmar Password {isAddingUser ? '*' : ''}</label>
                  <input 
                    type="password" 
                    required={isAddingUser && !!uPassword}
                    value={uPasswordConfirm}
                    onChange={e => setUPasswordConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">Grupo *</label>
                  <select 
                    value={uRoleId}
                    onChange={e => {
                      const selectedGroup = userGroups.find(g => g.id === e.target.value);
                      setURoleId(e.target.value);
                      if (selectedGroup?.name.toLowerCase().includes('admin')) {
                        setUType('Admin');
                      } else if (selectedGroup?.name.toLowerCase().includes('sales') || selectedGroup?.name.toLowerCase().includes('comercial')) {
                        setUType('Sales');
                      } else {
                        setUType('Team');
                      }
                    }}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white font-semibold"
                  >
                    {userGroups?.filter(g => !g.deleted).map(group => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2.5 md:pt-6 h-fit min-h-[42px]">
                  <input 
                    type="checkbox" 
                    id="userIsAdmin"
                    checked={uIsAdmin}
                    onChange={e => setUIsAdmin(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="userIsAdmin" className="text-slate-700 font-bold select-none cursor-pointer text-xs uppercase tracking-wider">
                    Administrador
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => {
                    setIsAddingUser(false);
                    setEditingUser(null);
                  }}
                  className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 -sm"
                >
                  {isAddingUser ? 'Adicionar Recurso' : 'Gravar Alterações'}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 -sm overflow-hidden text-xs">
              
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Utilizadores</h2>
                  <p className="text-xs text-slate-500">Utilizadores ativos na plataforma</p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 self-start md:self-auto">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">Filtrar por Grupo:</span>
                    <select
                      value={filterGroupId}
                      onChange={e => setFilterGroupId(e.target.value)}
                      className="p-2 border border-slate-200 rounded-xl bg-white font-bold text-slate-700 text-xs focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer"
                    >
                      <option value="all">-- Todos --</option>
                      {userGroups?.filter(g => !g.deleted).map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    onClick={startAddUser}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl -sm"
                  >
                    <Plus className="w-4 h-4" /> Novo utilizador
                  </button>
                </div>
              </div>

              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase border-b border-slate-100 font-bold">
                  <tr>
                    <th className="px-5 py-3">Nome</th>
                    <th className="px-5 py-3">E-mail</th>
                    <th className="px-5 py-3">Grupo / Permissão</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {users
                    .filter(u => !u.deleted)
                    .filter(u => filterGroupId === 'all' || u.roleId === filterGroupId)
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }))
                    .map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center font-extrabold text-xs">
                            {getUserInitials(u.name)}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-800 text-sm">{u.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-slate-500">{u.email}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-700 font-bold">
                            {getGroupName(u.roleId)}
                          </span>
                          {u.isAdmin && (
                            <span className="px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 rounded text-[10px] font-sans font-bold uppercase tracking-wide">
                              Admin
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                          <UserCheck className="w-3.5 h-3.5" /> Ativo
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => startEditUser(u)}
                            className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" /> Editar
                          </button>
                          <span className="text-slate-300">|</span>
                          <button 
                            onClick={() => askConfirmation(
                              'Confirmar Eliminação de Utilizador',
                              `Aviso: Isto irá remover permanentemente o utilizador ${u.name} (${u.email}) do diretório de colaboradores ativos. Pretende continuar?`,
                              () => deleteUser(u.id)
                            )}
                            className="text-red-500 hover:text-red-700 font-bold"
                          >
                            Apagar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

            </div>
          )}
        </div>
      )}

      {subTab === 'permissions' && (
        <div className="bg-white rounded-2xl border border-slate-200 -sm p-6 space-y-6 animate-fade-in text-xs font-bold text-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-800">Grupos e Permissões</h2>
            <p className="text-xs text-slate-500">Gira as permissões de acesso às funcionalidades por grupo de utilizadores</p>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            {/* Left side: Group Selection list */}
            <div className="md:w-1/3 space-y-2 border-r border-slate-150 pr-6">
              <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Grupos Disponíveis:</span>
              <div className="space-y-1.5">
                {activeGroups.map(groupItem => {
                  const isSelected = activeSelectedGroupId === groupItem.id;
                  return (
                    <button
                      key={groupItem.id}
                      onClick={() => setSelectedGroupId(groupItem.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border font-bold text-xs flex items-center justify-between transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-slate-900 border-slate-900 text-white -sm'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span>{groupItem.name}</span>
                      <Shield className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right side: Checkbox Permissions Tree */}
            <div className="flex-1 space-y-6">
              {group ? (
                <>
                  <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">
                        Permissões para o grupo: <span className="text-blue-600 underline">{group.name}</span>
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">As alterações são guardadas e aplicadas imediatamente</p>
                    </div>
                  </div>

                  {!updateAuxRecord ? (
                    <div className="p-4 bg-amber-50 text-amber-800 rounded-xl flex items-center gap-2 border border-amber-200 font-bold">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>Modo de visualização. Para alterar as permissões, utilize a área de administração com direitos suficientes.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {[
                        {
                          title: 'Projetos',
                          keys: ['projects_read', 'projects_write', 'projects_delete']
                        },
                        {
                          title: 'Tarefas',
                          keys: ['tasks_read', 'tasks_write', 'tasks_delete']
                        },
                        {
                          title: 'Calendário e Agendamento',
                          keys: ['calendar_read', 'calendar_write']
                        },
                        {
                          title: 'Clientes',
                          keys: ['clients_read', 'clients_write', 'clients_delete']
                        },
                        {
                          title: 'Ausências',
                          keys: ['absences_read', 'absences_write', 'absences_delete']
                        },
                        {
                          title: 'Configurações',
                          keys: ['config_read', 'config_write']
                        },
                        {
                          title: 'Administração de Utilizadores',
                          keys: ['users_read', 'users_write', 'users_delete']
                        }
                      ].map(cat => (
                        <div key={cat.title} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3.5">
                          <h4 className="text-xs font-bold text-slate-850 border-b border-slate-200 pb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                            <Shield className="w-3.5 h-3.5 text-slate-500" />
                            {cat.title}
                          </h4>
                          <div className="space-y-2">
                            {cat.keys.map(key => {
                              const friendlyName: Record<string, string> = {
                                projects_read: 'Ver Projetos',
                                projects_write: 'Criar / Editar Projetos',
                                projects_delete: 'Eliminar Projetos',
                                tasks_read: 'Ver Tarefas',
                                tasks_write: 'Criar / Editar Tarefas',
                                tasks_delete: 'Eliminar Tarefas',
                                calendar_read: 'Ver Calendário',
                                calendar_write: 'Criar / Editar Agendamentos',
                                clients_read: 'Ver Clientes',
                                clients_write: 'Criar / Editar Clientes',
                                clients_delete: 'Eliminar Clientes',
                                absences_read: 'Ver Ausências',
                                absences_write: 'Criar / Editar Ausências',
                                absences_delete: 'Eliminar Ausências',
                                config_read: 'Ver Configurações',
                                config_write: 'Editar Configurações',
                                users_read: 'Ver Utilizadores',
                                users_write: 'Criar / Editar Utilizadores',
                                users_delete: 'Eliminar Utilizadores',
                              };
                              const labelText = friendlyName[key] || key;

                              const isChecked = !!(permissions as any)?.[key];

                              return (
                                <label
                                  key={key}
                                  className="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-200/80 hover:bg-slate-50 cursor-pointer select-none transition-colors"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleTogglePermission(key)}
                                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span className="text-slate-700 font-bold text-xs">{labelText}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center text-slate-400 font-medium">
                  Selecione um grupo na lista lateral para gerir as suas permissões.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { UserAbsence, SpecialDay, AppConfiguration } from '../lib/types';
import { Plus, Trash2, Calendar, Users, UserCheck, Edit2, ChevronLeft, ChevronRight, ArrowUpDown, Filter, ShieldCheck } from 'lucide-react';
import { hashPassword } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import { hasPermission, normalizeRoleId } from '../lib/permissions';

// UI Foundation Components
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Input from './ui/Input';
import Select from './ui/Select';
import Card from './ui/Card';
import Badge from './ui/Badge';
import { M3SectionHeader, M3SegmentedControl } from './M3';
import { getAbsenceVisibility } from '../lib/absenceVisibility';
import { getClientToken } from '../lib/clientAuth';
import RolePermissionSection from './RolePermissionSection';

interface UserSectionProps {
  absences: UserAbsence[];
  users: any[];
  userGroups: any[];
  addAbsence: (abs: any) => void;
  deleteAbsence: (id: string) => void;
  addUser: (user: any) => Promise<string | null> | string | null | void;
  updateUser: (id: string, updates: any) => Promise<boolean> | boolean | void;
  deleteUser: (id: string) => void;
  hideAbsences?: boolean;
  hideUsers?: boolean;
  specialDays?: SpecialDay[];
  currentUser?: any;
  appConfig?: AppConfiguration;
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
  currentUser,
  appConfig,
}: UserSectionProps) {
  const canReadAbsences = hasPermission(currentUser, 'absences_read', userGroups);
  const canWriteAbsences = hasPermission(currentUser, 'absences_write', userGroups);
  const canDeleteAbsences = hasPermission(currentUser, 'absences_delete', userGroups);

  const canReadUsers = hasPermission(currentUser, 'users_read', userGroups);
  const canWriteUsers = hasPermission(currentUser, 'users_write', userGroups);
  const canDeleteUsers = hasPermission(currentUser, 'users_delete', userGroups);

  const [subTab, setSubTab] = useState<'absences' | 'users' | 'roles'>(hideAbsences ? 'users' : 'absences');
  const [filterRoleId, setFilterRoleId] = useState<string>('all');
  const [rbacRoles, setRbacRoles] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [rbacUserRoles, setRbacUserRoles] = useState<Array<{ user_id: string; role_id: string }>>([]);

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
  const absenceVisibility = useMemo(() => getAbsenceVisibility(users, userGroups, appConfig), [users, userGroups, appConfig]);
  const absenceUsers = absenceVisibility.users;
  const absenceUserIds = useMemo(() => new Set(absenceUsers.map(user => user.id)), [absenceUsers]);
  const visibleAbsences = useMemo(() => absences.filter(absence => absenceUserIds.has(absence.userId)), [absences, absenceUserIds]);

  // Absence Filters & Sorting States
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterUserId, setFilterUserId] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  useEffect(() => {
    if (userId && !absenceUserIds.has(userId)) setUserId('');
    if (filterUserId !== 'all' && !absenceUserIds.has(filterUserId)) setFilterUserId('all');
  }, [absenceUserIds, userId, filterUserId]);
  const absenceUserOptions = absenceVisibility.groups.map(group => (
    <optgroup key={group.id} label={group.name}>
      {absenceUsers.filter(user => (normalizeRoleId(user.roleId) || user.roleId?.trim()) === (normalizeRoleId(group.id) || group.id.trim()))
        .map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
    </optgroup>
  ));

  // Calendar State
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(() => new Date());

  // User Form State
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uPasswordConfirm, setUPasswordConfirm] = useState('');
  const [uType, setUType] = useState<'Team' | 'Sales' | 'Admin' | 'External' | 'Other'>('Team');
  const [uRoleIds, setURoleIds] = useState<string[]>([]);

  useEffect(() => {
    if (!hasPermission(currentUser, 'roles_read' as any, userGroups)) return;
    const token = getClientToken();
    fetch('/api/rbac/catalog', {
      credentials: 'same-origin',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível carregar as funções.');
      setRbacRoles((result.roles || []).filter((role: any) => role.is_active));
      setRbacUserRoles(result.userRoles || []);
    }).catch(error => console.error('Falha ao carregar funções RBAC:', error));
  }, [currentUser, userGroups]);

  const handleAddAbsenceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteAbsences) {
      alert('Não tem permissão para registar ausências.');
      return;
    }
    const activeUserId = userId;
    if (!activeUserId || !absenceUserIds.has(activeUserId) || !startDate || !endDate) {
      alert('Por favor, selecione um utilizador e preencha todos os campos da ausência.');
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
    setUserId('');
    setStartDate('');
    setEndDate('');
  };

  const startAddUser = () => {
    setEditingUser(null);
    setUName('');
    setUEmail('');
    setUPassword('');
    setUPasswordConfirm('');
    setUType('Team');
    setURoleIds([]);
    setIsAddingUser(true);
  };

  const startEditUser = (user: any) => {
    setIsAddingUser(false);
    setEditingUser(user);
    setUName(user.name);
    setUEmail(user.email);
    setUPassword('');
    setUPasswordConfirm('');
    setUType(user.type || 'Team');
    setURoleIds(rbacUserRoles.filter(assignment => assignment.user_id === user.id).map(assignment => assignment.role_id));
  };

  const assignUserRoles = async (targetUserId: string, roleIds: string[]) => {
    const token = getClientToken();
    const response = await fetch(`/api/rbac/users/${targetUserId}/roles`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ roleIds }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível guardar as funções atribuídas.');
    setRbacUserRoles(current => [...current.filter(assignment => assignment.user_id !== targetUserId), ...roleIds.map(role_id => ({ user_id: targetUserId, role_id }))]);
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
    if (canManageRoleAssignments && !uRoleIds.length) {
      alert('Atribua pelo menos uma função ao utilizador.');
      return;
    }
    const hashedPassword = await hashPassword(uPassword);
    const newUserId = await addUser({
      name: uName,
      email: uEmail,
      password: hashedPassword,
      roleId: '',
      type: uType,
      approved: true,
    });
    if (!newUserId) {
      alert('Não foi possível gravar o utilizador na base de dados.');
      return;
    }
    if (canManageRoleAssignments && uRoleIds.length) {
      try { await assignUserRoles(newUserId, uRoleIds); }
      catch (error) { alert(error instanceof Error ? `Utilizador criado, mas não foi possível atribuir funções: ${error.message}` : 'Utilizador criado, mas a atribuição de funções falhou.'); }
    }
    setUName('');
    setUEmail('');
    setUPassword('');
    setUPasswordConfirm('');
    setURoleIds([]);
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
    if (canManageRoleAssignments && !uRoleIds.length) {
      alert('Atribua pelo menos uma função ao utilizador.');
      return;
    }

    const updates: any = {
      name: uName,
      email: uEmail,
      type: uType,
    };

    if (uPassword) {
      if (uPassword !== uPasswordConfirm) {
        alert('As passwords introduzidas não coincidem.');
        return;
      }
      updates.password = await hashPassword(uPassword);
    }

    const userUpdated = await updateUser(editingUser.id, updates);
    if (userUpdated === false) {
      alert('Não foi possível guardar as alterações do utilizador.');
      return;
    }
    if (canManageRoleAssignments) {
      try { await assignUserRoles(editingUser.id, uRoleIds); }
      catch (error) { alert(error instanceof Error ? `Dados atualizados, mas não foi possível guardar as funções: ${error.message}` : 'Dados atualizados, mas a atribuição de funções falhou.'); }
    }
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

  const getAssignedRoleNames = (targetUserId: string) => rbacUserRoles
    .filter(assignment => assignment.user_id === targetUserId)
    .map(assignment => rbacRoles.find(role => role.id === assignment.role_id)?.name)
    .filter((name): name is string => !!name);

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
      'bg-primary/10 text-primary border-primary/20',
      'bg-brand-green/10 text-success-strong border-brand-green/20',
      'bg-surface-muted text-text-primary border-border',
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
    visibleAbsences.forEach(abs => {
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
  }, [visibleAbsences]);

  const processedAbsences = useMemo(() => {
    let list = [...visibleAbsences];

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
  }, [visibleAbsences, filterUserId, filterYear, sortOrder]);

  const canManageRoleAssignments = hasPermission(currentUser, 'roles_manage' as any, userGroups);
  const canReadRoleAdmin = canManageRoleAssignments;
  const managementTabs: Array<{ value: 'absences' | 'users' | 'roles'; label: string }> = [
    ...(!hideAbsences ? [{ value: 'absences' as const, label: 'Ausências' }] : []),
    ...(!hideUsers ? [{ value: 'users' as const, label: 'Utilizadores' }] : []),
    ...(canReadRoleAdmin ? [{ value: 'roles' as const, label: 'Funções e permissões' }] : []),
  ];

  return (
    <div className="space-y-6">
      
      {managementTabs.length > 1 && <M3SegmentedControl
        label="Secção de administração"
        value={subTab}
        options={managementTabs}
        onChange={value => setSubTab(value)}
        className="w-fit"
      />}
      {subTab === 'absences' && (
        <div className="space-y-6">
          <Card className="p-4 sm:p-5 bg-surface-muted/60"><M3SectionHeader title="Registo de ausências" description="Planeamento de ausências dos grupos associados às tarefas." /></Card>
          {/* Top Row: Form & Calendar */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            
            {/* Add Absence Form */}
            <Card className="xl:col-span-4 p-4 sm:p-5 h-fit">
              <div className="mb-4"><M3SectionHeader title="Marcar ausência" /></div>
              
              <form onSubmit={handleAddAbsenceSubmit} className="space-y-4 text-body-sm font-bold text-text-secondary">
                <div className="space-y-1">
                  <Select label="Utilizador *"
                    required
                    value={userId}
                    onChange={e => setUserId(e.target.value)}
                    disabled={!canWriteAbsences || !absenceUsers.length}
                  >
                    <option value="">-- Selecione um utilizador --</option>
                    {absenceUserOptions}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Input label="Data de Início *"
                    type="date" 
                    required
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Input label="Data de fim *"
                    type="date" 
                    required
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Select label="Motivo *"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  >
                    <option value="Vacation">Ausente</option>
                    <option value="Other">Outro</option>
                  </Select>
                </div>

                <Button variant="primary"
                  type="submit"
                  disabled={!canWriteAbsences || !absenceUsers.length}
                  className="w-full mt-2"
                >
                  Gravar Ausência
                </Button>
              </form>
              {!absenceVisibility.groups.length && <p role="status" className="mt-3 text-body-sm text-text-secondary">Defina os Grupos Associados Tarefas nas Configurações para registar ausências.</p>}
            </Card>

            {/* Monthly Calendar View */}
            <Card className="xl:col-span-8 p-4 sm:p-5 space-y-4 min-w-0">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
              <M3SectionHeader title="Calendário mensal" description="Ausências dos grupos associados às tarefas." />

              {/* Calendar Navigator */}
              <div className="flex flex-wrap items-center gap-2 select-none">
                <IconButton size="sm" aria-label="Mês anterior"
                  onClick={() => setCurrentCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  title="Mês anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </IconButton>
                <span className="text-body-sm font-bold text-text-secondary min-w-[130px] text-center uppercase tracking-wider">
                  {new Intl.DateTimeFormat('pt', { month: 'long', year: 'numeric' }).format(currentCalendarDate)}
                </span>
                <IconButton size="sm" aria-label="Mês seguinte"
                  onClick={() => setCurrentCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  title="Mês seguinte"
                >
                  <ChevronRight className="w-4 h-4" />
                </IconButton>
                <Button variant="secondary" size="sm"
                  onClick={() => setCurrentCalendarDate(new Date())}
                >
                  Hoje
                </Button>
              </div>
            </div>

            {/* Continuous, table-like Calendar Grid */}
            <div className="bg-surface border border-border rounded-control overflow-hidden">
              <div className="grid grid-cols-7 border-b border-border bg-surface-muted text-caption font-bold text-text-secondary uppercase text-center select-none">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                  <div key={d} className="py-2 border-r border-border last:border-0">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 text-body-sm">
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
                      <div key={`empty-${i}`} className="min-h-[80px] p-2 border-b border-r border-border bg-surface-muted/50"></div>
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

                    const dayAbsences = visibleAbsences.filter(abs => {
                      return abs.absenceStartDate <= dateStr && abs.absenceEndDate >= dateStr;
                    });
                    const isToday = dateStr === todayStr;

                    cells.push(
                      <div 
                        key={`day-${d}`} 
                        className={`min-h-[80px] p-1.5 border-b border-r border-border relative transition-colors hover:bg-surface-muted/50 flex flex-col justify-between ${
                          isWeekend || isSpecial ? 'bg-surface-muted/60' : 'bg-surface'
                        }`}
                      >
                        {/* Cell Header */}
                        <div className="flex justify-between items-start mb-1 select-none">
                          <span className={`inline-flex items-center justify-center w-7 h-7 text-center rounded-full font-bold text-caption ${
                            isToday ? 'bg-primary text-white font-black' : 'text-text-secondary'
                          }`}>
                            {d}
                          </span>
                          {specialDay && (
                            <span 
                              className="text-caption font-extrabold text-text-primary bg-warning/10 border border-warning/20 px-1 py-0.5 rounded truncate max-w-[50px]"
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
                                className={`inline-flex items-center justify-center w-5 h-5 text-caption font-bold rounded-full border transition-all cursor-help ${colorClass}`}
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
                      <div key={`empty-end-${i}`} className="min-h-[80px] p-2 border-b border-r border-border bg-surface-muted/50"></div>
                    );
                  }

                  return cells;
                })()}
              </div>
            </div>
          </Card>
          </div>

          {/* Absences List Table with Filters & Sorting */}
          <Card className="overflow-hidden text-body-sm animate-fade-in">
              <div className="p-4 sm:p-5 border-b border-border/80 bg-surface-muted/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <M3SectionHeader title="Ausências registadas" description="Últimos 25 registos guardados dos grupos configurados." />
                
                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* User Filter */}
                  <div className="relative">
                    <Select
                      aria-label="Filtrar ausências por utilizador"
                      value={filterUserId}
                      onChange={e => setFilterUserId(e.target.value)}
                    >
                      <option value="all">Todos os utilizadores</option>
                      {absenceUserOptions}
                    </Select>
                  </div>

                  {/* Year Filter */}
                  <div className="relative">
                    <Select
                      aria-label="Filtrar ausências por ano"
                      value={filterYear}
                      onChange={e => setFilterYear(e.target.value)}
                    >
                      <option value="all">Todos os anos</option>
                      {years.map(y => (
                        <option key={y} value={y}>{y} {y === new Date().getFullYear().toString() ? '(Atual)' : ''}</option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>

              {processedAbsences.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <p className="text-text-secondary font-medium">Nenhuma ausência encontrada com os filtros selecionados.</p>
                  {(filterUserId !== 'all' || filterYear !== 'all') && (
                    <Button variant="ghost" size="sm"
                      type="button"
                      onClick={() => { setFilterUserId('all'); setFilterYear('all'); }}
                      className="text-primary hover:underline font-bold text-body-sm cursor-pointer"
                    >
                      Limpar filtros
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[650px] text-left border-collapse">
                    <thead className="bg-surface-muted/90 text-caption uppercase tracking-wider text-text-secondary font-bold border-b border-border/80 whitespace-nowrap select-none">
                      <tr>
                        <th className="px-5 py-3.5 text-left">Utilizador</th>
                        <th 
                          className="px-5 py-3.5 cursor-pointer hover:text-text-primary transition-colors"
                          onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        >
                          <div className="flex items-center gap-1.5">
                            Data início
                            <ArrowUpDown className={`w-3.5 h-3.5 ${sortOrder === 'asc' ? 'text-primary' : 'text-text-secondary'}`} />
                          </div>
                        </th>
                        <th className="px-5 py-3.5 text-left">Data fim</th>
                        <th className="px-5 py-3.5 text-left">Motivo</th>
                        <th className="px-5 py-3.5 text-center">Duração</th>
                        <th className="px-5 py-3.5 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-medium text-text-secondary">
                      {processedAbsences.map(abs => {
                        const totalDays = calculateDays(abs.absenceStartDate, abs.absenceEndDate);
                        return (
                          <tr key={abs.id} className="hover:bg-surface-muted/50 transition-colors">
                            <td className="px-5 py-3.5">
                              <span className="font-bold text-text-primary">{getUserName(abs.userId)}</span>
                            </td>
                            <td className="px-5 py-3.5 font-mono text-text-secondary whitespace-nowrap">{abs.absenceStartDate}</td>
                            <td className="px-5 py-3.5 font-mono text-primary font-bold whitespace-nowrap">{abs.absenceEndDate}</td>
                            <td className="px-5 py-3.5">
                              <Badge>
                                {getTranslatedReason(abs.reason || 'Other')}
                              </Badge>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <Badge>
                                {totalDays} {totalDays === 1 ? 'dia' : 'dias'}
                              </Badge>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <Button variant="ghost" size="sm"
                                type="button"
                                onClick={() => askConfirmation(
                                  'Confirmar Eliminação de Ausência',
                                  `Aviso: Isto irá remover permanentemente o registo de ausência de ${getUserName(abs.userId)} (${abs.absenceStartDate} a ${abs.absenceEndDate}). Pretende continuar?`,
                                  () => deleteAbsence(abs.id)
                                )}
                                className="text-error hover:text-error font-bold cursor-pointer transition-colors"
                              >
                                Eliminar
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-5 py-3.5 border-t border-border/80 bg-surface-muted/70 text-right text-body-sm text-text-secondary font-medium">
                    A mostrar <span className="font-bold text-text-primary">{processedAbsences.length}</span> {processedAbsences.length === 1 ? 'resultado' : 'resultados'}
                  </div>
                </div>
              )}
            </Card>
        </div>
      )}

      {subTab === 'users' && (
        // USERS DIRECTORY SECTION
        <div className="space-y-6">
          {isAddingUser || editingUser ? (
            <form onSubmit={isAddingUser ? handleAddUserSubmit : handleEditUserSubmit} className="m3-card p-5 space-y-6 animate-fade-in text-sm text-text-primary">
              <div className="flex justify-between items-center pb-4 border-b border-border">
                <h2 className="text-heading-sm font-semibold text-text-primary">
                  {isAddingUser ? 'Adicionar utilizador' : 'Editar utilizador'}
                </h2>
                <button 
                  type="button" 
                  onClick={() => {
                    setIsAddingUser(false);
                    setEditingUser(null);
                  }}
                  className="rounded-control border border-border bg-surface-muted px-3 py-1.5 text-text-secondary hover:text-text-primary"
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
                    className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
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
                    className="w-full rounded-control border border-border bg-surface px-3 py-2.5 font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
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
                    className="w-full rounded-control border border-border bg-surface px-3 py-2.5 font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
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
                    className="w-full rounded-control border border-border bg-surface px-3 py-2.5 font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>

                {canManageRoleAssignments ? <fieldset className="md:col-span-2 rounded-xl border border-border bg-surface-muted/50 p-4 space-y-3">
                  <legend className="px-1 text-sm font-semibold text-text-primary">Funções do novo sistema</legend>
                  <p className="text-xs font-normal text-text-secondary">As permissões efetivas são a união das funções selecionadas. A atribuição é auditada.</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {rbacRoles.map(role => (
                      <label key={role.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${uRoleIds.includes(role.id) ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-surface-muted'}`}>
                        <input type="checkbox" checked={uRoleIds.includes(role.id)} onChange={event => setURoleIds(ids => event.target.checked ? [...new Set([...ids, role.id])] : ids.filter(id => id !== role.id))} className="mt-0.5 accent-primary" />
                        <span className="min-w-0"><span className="block text-sm font-semibold text-text-primary">{role.name}</span><span className="block text-[11px] font-normal text-text-muted">{role.code}</span></span>
                      </label>
                    ))}
                  </div>
                  {!rbacRoles.length && <p className="text-sm font-medium text-warning">Não foi possível carregar as funções disponíveis.</p>}
                </fieldset> : <div className="md:col-span-2 rounded-xl border border-border bg-surface-muted/50 p-4">
                  <p className="text-sm font-semibold text-text-primary">Funções atribuídas</p>
                  <div className="mt-2 flex flex-wrap gap-2">{getAssignedRoleNames(editingUser?.id || '').length ? getAssignedRoleNames(editingUser?.id || '').map(name => <span key={name} className="rounded-md border border-primary/15 bg-primary/5 px-2 py-1 text-xs text-primary">{name}</span>) : <span className="text-sm text-text-secondary">Sem função atribuída. Solicite a um Super Administrador que configure o acesso.</span>}</div>
                </div>}
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddingUser(false);
                    setEditingUser(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                >
                  {isAddingUser ? 'Adicionar Recurso' : 'Gravar Alterações'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="m3-card overflow-hidden text-sm animate-fade-in">
              
              <div className="flex flex-col justify-between gap-3 border-b border-border bg-surface-muted/50 p-4 sm:flex-row sm:items-center sm:p-5">
                <div>
                  <h2 className="text-heading-sm font-semibold text-text-primary">Utilizadores</h2>
                  <p className="mt-0.5 text-sm text-text-secondary">Utilizadores ativos na plataforma</p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="whitespace-nowrap text-sm font-medium text-text-secondary">Função:</span>
                    <select
                      value={filterRoleId}
                      onChange={e => setFilterRoleId(e.target.value)}
                      className="cursor-pointer rounded-control border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
                    >
                      <option value="all">Todas as funções</option>
                      {rbacRoles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    onClick={startAddUser}
                  >
                    <Plus className="w-4 h-4" /> Novo utilizador
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[700px] text-left border-collapse">
                  <thead className="select-none whitespace-nowrap border-b border-border bg-surface-muted/70 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Nome</th>
                    <th className="px-5 py-3.5 text-left">E-mail</th>
                    <th className="px-5 py-3.5 text-left">Funções / Permissões</th>
                    <th className="px-5 py-3.5 text-left">Estado</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {users
                    .filter(u => !u.deleted)
                    .filter(u => filterRoleId === 'all' || rbacUserRoles.some(assignment => assignment.user_id === u.id && assignment.role_id === filterRoleId))
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
                          {getAssignedRoleNames(u.id).length ? getAssignedRoleNames(u.id).map(name => (
                            <span key={name} className="px-2 py-1 bg-primary/5 border border-primary/15 rounded-md text-[11px] font-medium text-primary">{name}</span>
                          )) : <span className="text-xs text-text-muted">Sem função atribuída</span>}
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

            </div>
          )}
        </div>
      )}

      {subTab === 'roles' && canReadRoleAdmin && <RolePermissionSection />}
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

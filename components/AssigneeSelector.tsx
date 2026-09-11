import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { User } from '../lib/types';

interface AssigneeSelectorProps {
  users: User[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  filterTeamOnly?: boolean;
  label?: string;
  className?: string;
}

export const AssigneeSelector: React.FC<AssigneeSelectorProps> = ({
  users,
  selectedIds,
  onChange,
  filterTeamOnly = false,
  label = 'Técnicos Alocados',
  className = ''
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = useMemo(() => {
    return users
      .filter(u => !u.deleted && (!filterTeamOnly || u.type === 'Team'))
      .filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase().trim()))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'));
  }, [users, filterTeamOnly, searchTerm]);

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-slate-700">{label}</label>
        {selectedIds.length > 0 && (
          <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
            {selectedIds.length} selecionado(s)
          </span>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Pesquisar técnico por nome..."
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:outline-none placeholder:text-slate-400 text-slate-800 font-medium"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600 font-bold bg-slate-100 hover:bg-slate-200 rounded-full w-4 h-4 flex items-center justify-center transition-colors"
            title="Limpar pesquisa"
          >
            ×
          </button>
        )}
      </div>

      {/* Technician Checkboxes List */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 max-h-36 overflow-y-auto space-y-1">
        {filteredUsers.length === 0 ? (
          <p className="text-slate-400 italic text-[11px] text-center py-3">
            {searchTerm ? 'Nenhum técnico encontrado' : 'Nenhum técnico disponível'}
          </p>
        ) : (
          filteredUsers.map(u => {
            const isSelected = selectedIds.includes(u.id);
            return (
              <label
                key={u.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer select-none text-xs font-semibold transition-colors ${
                  isSelected ? 'bg-blue-50/90 text-blue-900 border border-blue-200/60' : 'hover:bg-slate-100/90 text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggle(u.id)}
                  className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="truncate flex-1">{u.name}</span>
                {u.type && (
                  <span className="text-[10px] text-slate-400 font-normal truncate max-w-[120px]">
                    {u.type === 'Team' ? 'Técnico' : u.type}
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { User } from '@/lib/types';
import { userHasAnyRole } from '@/lib/roleAssociations';

interface AssigneeSelectorProps {
  users: User[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  allowedGroupIds?: string[];
  filterTeamOnly?: boolean;
  label?: string;
  className?: string;
}

export const AssigneeSelector: React.FC<AssigneeSelectorProps> = ({
  users,
  selectedIds,
  onChange,
  allowedGroupIds,
  filterTeamOnly = false,
  label = 'Utilizadores',
  className = ''
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = useMemo(() => {
    return users
      .filter(u => !u.deleted)
      .filter(u => {
        if (allowedGroupIds) {
          return userHasAnyRole(u, allowedGroupIds);
        }
        if (filterTeamOnly) {
          return u.type === 'Team';
        }
        return true;
      })
      .filter(u => (u.name || '').toLowerCase().includes(searchTerm.toLowerCase().trim()))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-PT', { sensitivity: 'base' }));
  }, [users, allowedGroupIds, filterTeamOnly, searchTerm]);

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
        <label className="block text-xs font-bold text-text-primary">{label}</label>
        {selectedIds.length > 0 && (
          <span className="text-small-label font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
            {selectedIds.length} selecionado(s)
          </span>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input aria-label="Pesquisar utilizadores"
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Pesquisar utilizador por nome..."
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-surface border border-border rounded-control focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none placeholder:text-text-muted text-text-primary font-medium"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-micro text-text-muted hover:text-text-secondary font-bold bg-surface-muted hover:bg-surface-elevated rounded-full w-4 h-4 flex items-center justify-center transition-colors"
            title="Limpar pesquisa"
          >
            ×
          </button>
        )}
      </div>

      {/* Eligible users */}
      <div className="bg-surface-muted border border-border rounded-card p-2 max-h-48 overflow-y-auto space-y-1">
        {filteredUsers.length === 0 ? (
          <p className="text-text-muted italic text-xs text-center py-3">
            {searchTerm ? 'Nenhum utilizador encontrado' : 'Nenhum utilizador disponível'}
          </p>
        ) : (
          filteredUsers.map(u => {
            const isSelected = selectedIds.includes(u.id);

            return (
              <label
                key={u.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-control cursor-pointer select-none text-xs font-semibold transition-colors ${
                  isSelected ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-surface-muted/90 text-text-primary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggle(u.id)}
                  className="w-3.5 h-3.5 text-primary rounded-badge border-border focus:ring-primary"
                />
                <span className="truncate flex-1">{u.name}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
};

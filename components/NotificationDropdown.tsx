'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { Notification } from '../lib/types';
import { cn } from '../lib/utils';
import IconButton from './ui/IconButton';

interface NotificationDropdownProps {
  notifications: Notification[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

export default function NotificationDropdown({ notifications, markAsRead, markAllAsRead }: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="relative" ref={ref}>
      <IconButton 
        variant="ghost" 
        size="md"
        onClick={() => setIsOpen(!isOpen)}
        className="relative hover:bg-surface-muted rounded-full"
        aria-label="Abrir notificações"
      >
        <Bell className="w-5 h-5 text-text-secondary hover:text-text-primary" />
        {unreadCount > 0 && (
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-error rounded-full ring-2 ring-surface"></span>
        )}
      </IconButton>

      {isOpen && (
        <div className="fixed right-4 sm:right-6 top-16 w-80 sm:w-96 bg-surface rounded-card shadow-modal border border-border z-[9999] overflow-hidden flex flex-col max-h-96 animate-fade-in text-left">
          <div className="p-4 border-b border-border flex items-center justify-between bg-surface-muted/40">
            <h3 className="font-bold text-body text-text-primary">Notificações</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-label font-semibold text-primary hover:text-primary-hover flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Marcar todas como lidas
              </button>
            )}
          </div>
          
          <div className="overflow-y-auto flex-1 p-3 space-y-2">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-body-sm">
                Não tem notificações.
              </div>
            ) : (
              notifications.map(notif => (
                <div 
                  key={notif.id} 
                  className={cn(
                    "p-3 rounded-control border text-body-sm flex gap-3 transition-all",
                    notif.isRead 
                      ? "bg-surface border-border-subtle opacity-60" 
                      : "bg-primary/5 border-primary/10 hover:bg-primary/10"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-bold truncate",
                      notif.isRead ? "text-text-secondary" : "text-text-primary"
                    )}>
                      {notif.title}
                    </p>
                    <p className="text-text-secondary text-caption mt-0.5 line-clamp-2">
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-caption text-text-muted font-mono font-medium">
                        {new Date(notif.createdDate).toLocaleString('pt-PT')}
                      </span>
                      {notif.linkUrl && (
                        <a 
                          href={notif.linkUrl} 
                          className="text-caption font-bold text-primary hover:text-primary-hover hover:underline flex items-center gap-0.5"
                        >
                          Ver detalhes <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {!notif.isRead && (
                    <button 
                      onClick={() => markAsRead(notif.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors cursor-pointer self-start shrink-0 border border-primary/10"
                      title="Marcar como lida"
                    >
                      <Check className="w-4 h-4 stroke-[2.5px]" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

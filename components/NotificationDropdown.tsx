import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, ExternalLink, X } from 'lucide-react';
import { Notification } from '../lib/types';

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
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors relative"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden flex flex-col max-h-96">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h3 className="font-bold text-sm text-slate-800">Notificações</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Marcar todas como lidas
              </button>
            )}
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">
                Não tem notificações.
              </div>
            ) : (
              notifications.map(notif => (
                <div 
                  key={notif.id} 
                  className={`p-3 rounded-lg text-sm flex gap-3 ${notif.isRead ? 'bg-white opacity-60' : 'bg-blue-50/50'}`}
                >
                  <div className="flex-1">
                    <p className={`font-semibold ${notif.isRead ? 'text-slate-600' : 'text-slate-800'}`}>
                      {notif.title}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5 line-clamp-2">
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(notif.createdDate).toLocaleString('pt-PT')}
                      </span>
                      {notif.linkUrl && (
                        <a href={notif.linkUrl} className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-0.5">
                          Ver detalhes <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {!notif.isRead && (
                    <button 
                      onClick={() => markAsRead(notif.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors"
                      title="Marcar como lida"
                    >
                      <Check className="w-4 h-4" />
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

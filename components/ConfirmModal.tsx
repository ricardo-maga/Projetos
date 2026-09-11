'use client';

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in" id="confirm-modal-overlay">
      <div className="bg-white rounded-2xl border border-slate-200 -xl max-w-md w-full p-6 space-y-4 text-slate-800 relative" id="confirm-modal-box">
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
          type="button"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-red-50 text-red-600 rounded-xl flex-shrink-0">
            <AlertTriangle className="w-5.5 h-5.5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-black text-slate-900 tracking-tight">{title}</h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-colors text-xs cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors text-xs -md -red-100 cursor-pointer"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

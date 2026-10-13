'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import { useAsyncAction } from '../hooks/useAsyncAction';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => unknown | Promise<unknown>;
  onCancel: () => void;
}

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: ConfirmModalProps) {
  const { busy, run } = useAsyncAction();
  return (
    <Dialog isOpen={isOpen} onClose={() => { if (!busy) onCancel(); }} title={title}>
      <div className="space-y-5" id="confirm-modal-box">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-error/10 text-error rounded-control shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-body-sm text-text-secondary leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            isLoading={busy}
            onClick={() => {
              void run(async () => {
                try {
                  const result = await onConfirm();
                  if (result && typeof result === 'object' && 'success' in result && result.success === false) {
                    alert('message' in result && typeof result.message === 'string' ? result.message : 'A operação falhou. Tente novamente.');
                    return;
                  }
                  onCancel();
                } catch (error) {
                  alert(error instanceof Error ? error.message : 'A operação falhou. Tente novamente.');
                }
              });
            }}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}


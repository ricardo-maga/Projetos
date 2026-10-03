'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Dialog from './ui/Dialog';
import Button from './ui/Button';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onCancel} title={title}>
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
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}


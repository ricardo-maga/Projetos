'use client';

import React from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface-muted text-text-primary">
      <div className="max-w-md w-full bg-surface rounded-card p-8 border border-border text-center space-y-4">
        <h2 className="text-xl font-bold text-text-primary">Ocorreu um erro no sistema</h2>
        <p className="text-sm text-text-secondary">
          {error?.message || 'Ocorreu uma falha inesperada ao carregar a página.'}
        </p>
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 bg-action-600 hover:bg-action-700 text-inverse rounded-card font-bold text-sm transition-colors cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}


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
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 text-slate-800">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Ocorreu um erro no sistema</h2>
        <p className="text-sm text-slate-500">
          {error?.message || 'Ocorreu uma falha inesperada ao carregar a página.'}
        </p>
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}


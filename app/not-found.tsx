import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface-muted text-text-primary">
      <div className="max-w-md w-full bg-white rounded-card p-8 border border-border text-center space-y-4">
        <h2 className="text-2xl font-bold text-text-primary">404 - Página Não Encontrada</h2>
        <p className="text-sm text-text-secondary">
          A página ou recurso solicitado não foi encontrado.
        </p>
        <Link
          href="/"
          className="inline-flex px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-card font-bold text-sm transition-colors"
        >
          Voltar ao Início
        </Link>
      </div>
    </div>
  );
}


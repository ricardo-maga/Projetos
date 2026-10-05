import React from 'react';
import { Loader2 } from 'lucide-react';
import Card from './ui/Card';

export default function AppLoadingScreen({ id }: { id: string }) {
  return (
    <main id={id} className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm p-8 text-center space-y-6" role="status" aria-live="polite" aria-busy="true">
        <div className="m3-calendar-icon mx-auto flex h-16 w-16 items-center justify-center rounded-full">
          <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">A carregar dados...</h1>
          <p className="text-body-sm text-text-muted">A aguardar dados da base de dados.</p>
        </div>
      </Card>
    </main>
  );
}

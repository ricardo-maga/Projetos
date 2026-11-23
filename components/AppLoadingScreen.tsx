import React from 'react';
import { Loader2 } from 'lucide-react';
import { useSlowRead } from '@/hooks/useSlowRead';
import Card from './ui/Card';

export default function AppLoadingScreen({ id, progress }: { id: string; progress?: number | null }) {
  const slow = useSlowRead(true);
  return (
    <main id={id} className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm p-8 text-center space-y-6" role="status" aria-live="polite" aria-busy="true">
        <div className="m3-calendar-icon mx-auto flex h-16 w-16 items-center justify-center rounded-full">
          <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">A carregar dados...</h1>
          {slow && <p className="text-body-sm text-text-muted">Está a demorar mais do que o habitual.</p>}
          {slow && progress != null && progress > 0 && (
            <progress className="w-full" value={progress} max={3} aria-label="Carregamento dos dados" />
          )}
        </div>
      </Card>
    </main>
  );
}

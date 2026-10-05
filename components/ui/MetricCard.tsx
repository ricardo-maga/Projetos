import React from 'react';
import { Card } from './Card';

export function MetricCard({ title, value, note }: { title: string; value: number; note?: string }) {
  return <Card className="p-5 space-y-2">
    <h3 className="text-label text-text-secondary">{title}</h3>
    <p className="text-heading-lg text-text-primary tabular-nums">{value}</p>
    {note && <p className="text-caption text-text-secondary">{note}</p>}
  </Card>;
}

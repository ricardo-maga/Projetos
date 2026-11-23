import Button from './Button';

export default function ListEmptyState({ title, description, action }: {
  title: string;
  description?: string;
  action?: { label: string; run: () => void };
}) {
  return <div className="space-y-2 p-8 text-center">
    <p className="font-semibold text-text-primary" role="status">{title}</p>
    {description && <p className="text-body-sm text-text-secondary">{description}</p>}
    {action && <Button type="button" variant="secondary" size="sm" onClick={action.run}>{action.label}</Button>}
  </div>;
}

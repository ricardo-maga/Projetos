import { getUserInitials } from '@/lib/utils';

export default function UserInitialsBadge({ name }: { name?: string | null }) {
  return (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-primary text-caption font-bold uppercase text-inverse shadow-raised">
      {getUserInitials(name)}
    </span>
  );
}

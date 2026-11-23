import { cookies } from 'next/headers';
import { recoveryCookie } from '@/lib/auth/passwordRecovery';
import { PasswordRecoveryForm } from './PasswordRecoveryForm';

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const expired = (await searchParams).expired === '1';
  const canReset = !expired && (await cookies()).has(recoveryCookie);
  return <PasswordRecoveryForm canReset={canReset} expired={expired} />;
}

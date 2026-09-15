/**
 * Server-side Security Configuration Validation
 * Validates that all required Supabase and Security environment variables are present and secure.
 */

export interface SecurityConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey?: string;
  bootstrapAdminEmail?: string;
  bootstrapSecret?: string;
  bootstrapEnabled: boolean;
}

/**
 * Validates security configuration and fails fast if critical settings are missing.
 * Should be invoked on server-side operations and API startup.
 */
export function validateSecurityConfiguration(options?: { requireServiceRole?: boolean; requireBootstrap?: boolean }): SecurityConfig {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bootstrapAdminEmail = process.env.ERP_BOOTSTRAP_ADMIN_EMAIL;
  const bootstrapSecret = process.env.ERP_BOOTSTRAP_SECRET;
  const bootstrapEnabled = process.env.ERP_BOOTSTRAP_ENABLED === 'true';

  const missing: string[] = [];

  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (options?.requireServiceRole && !supabaseServiceRoleKey) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (options?.requireBootstrap) {
    if (!bootstrapAdminEmail) missing.push('ERP_BOOTSTRAP_ADMIN_EMAIL');
    if (!bootstrapSecret) missing.push('ERP_BOOTSTRAP_SECRET');
  }

  if (missing.length > 0) {
    const errorMsg = `[CRITICAL SECURITY CONFIGURATION ERROR] Missing required environment variables: ${missing.join(', ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Validate bootstrap secret strength if provided
  if (bootstrapSecret && bootstrapSecret.length < 32) {
    console.warn('[SECURITY WARNING] ERP_BOOTSTRAP_SECRET should be at least 32 characters of random entropy.');
  }

  return {
    supabaseUrl: supabaseUrl!,
    supabaseAnonKey: supabaseAnonKey!,
    supabaseServiceRoleKey,
    bootstrapAdminEmail,
    bootstrapSecret,
    bootstrapEnabled,
  };
}

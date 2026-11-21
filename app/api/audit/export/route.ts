import { withCanonicalErrors } from '@/lib/apiErrors';
import { handleAudit } from '@/domains/administration/modules/auditHttp';

export const dynamic = 'force-dynamic';
export const POST = withCanonicalErrors(req => handleAudit(req, true));

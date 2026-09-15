/**
 * Server-side Sliding-Window Rate Limiter
 * Used for authentication, bootstrap, password reset, and sensitive endpoints.
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup stale records periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000);
}

export interface RateLimitOptions {
  limit: number;      // Maximum allowed requests within window
  windowSeconds: number; // Time window in seconds
}

export function checkRateLimit(identifier: string, options: RateLimitOptions): { success: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  const record = rateLimitStore.get(identifier);

  if (!record || now > record.resetTime) {
    const newRecord: RateLimitRecord = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(identifier, newRecord);
    return {
      success: true,
      remaining: options.limit - 1,
      resetTime: newRecord.resetTime,
    };
  }

  if (record.count >= options.limit) {
    return {
      success: false,
      remaining: 0,
      resetTime: record.resetTime,
    };
  }

  record.count += 1;
  return {
    success: true,
    remaining: options.limit - record.count,
    resetTime: record.resetTime,
  };
}

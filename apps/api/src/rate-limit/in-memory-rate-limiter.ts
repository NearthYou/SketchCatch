export type RateLimitResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

export type RateLimiter = {
  consume(key: string): RateLimitResult;
};

export type CreateInMemoryRateLimiterOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
};

export function createInMemoryRateLimiter(options: CreateInMemoryRateLimiterOptions): RateLimiter {
  const attempts = new Map<string, number[]>();
  const now = options.now ?? (() => Date.now());

  return {
    consume(key) {
      const currentTime = now();
      const windowStart = currentTime - options.windowMs;
      const recentAttempts = (attempts.get(key) ?? []).filter((attempt) => attempt > windowStart);

      if (recentAttempts.length >= options.limit) {
        const oldestAttempt = recentAttempts[0] ?? currentTime;
        const retryAfterMs = Math.max(1, oldestAttempt + options.windowMs - currentTime);

        attempts.set(key, recentAttempts);

        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
        };
      }

      recentAttempts.push(currentTime);
      attempts.set(key, recentAttempts);

      return {
        allowed: true
      };
    }
  };
}

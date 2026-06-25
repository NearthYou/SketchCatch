export const LOGIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_LOCK_DURATION_MS = 10 * 60 * 1000;
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

export function getLoginAttemptWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - LOGIN_FAILURE_WINDOW_MS);
}

export function getLoginLockExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + LOGIN_LOCK_DURATION_MS);
}

export function shouldLockLogin(failedAttemptsInWindow: number): boolean {
  return failedAttemptsInWindow >= MAX_FAILED_LOGIN_ATTEMPTS;
}

export function isLoginLocked(lockedUntil: Date | null | undefined, now = new Date()): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

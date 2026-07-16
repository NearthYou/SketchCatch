import type { createDeploymentNotificationService } from "./deployment-notification-service.js";

type NotificationService = ReturnType<typeof createDeploymentNotificationService>;

export function startNotificationOutboxJob(
  createService: () => NotificationService,
  options: {
    intervalMs?: number;
    cleanupIntervalMs?: number;
    onError?: (error: unknown) => void;
  } = {}
): () => void {
  const intervalMs = options.intervalMs ?? 5_000;
  const cleanupIntervalMs = options.cleanupIntervalMs ?? 24 * 60 * 60 * 1000;
  let stopped = false;
  let running = false;
  let lastCleanupAt = Date.now();
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const service = createService();
      await service.dispatchPending();
      if (Date.now() - lastCleanupAt >= cleanupIntervalMs) {
        await service.cleanupRetention();
        lastCleanupAt = Date.now();
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

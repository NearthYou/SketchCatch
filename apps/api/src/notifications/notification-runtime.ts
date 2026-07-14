import type { DatabaseClient } from "../db/client.js";
import {
  getWebPushRuntimeConfig,
  type RuntimeEnv
} from "../config/env.js";
import { createDeploymentNotificationService } from "./deployment-notification-service.js";
import { createPostgresNotificationRepository } from "./notification-repository.js";
import { createWebPushSubscriptionCipher } from "./web-push-subscription-cipher.js";
import { createWebPushSender } from "./web-push-sender.js";

export function createDeploymentNotificationRuntime(options: {
  getDatabaseClient: () => DatabaseClient;
  runtimeEnv: RuntimeEnv;
  onDispatchError?: ((event: { outboxId: string; code: string }) => void) | undefined;
}) {
  const config = getWebPushRuntimeConfig(options.runtimeEnv);
  const cipher = config
    ? createWebPushSubscriptionCipher({
        current: {
          id: config.subscriptionKeyId,
          secret: config.subscriptionEncryptionKey
        }
      })
    : undefined;
  const pushSender = config
    ? createWebPushSender({
        subject: config.vapidSubject,
        publicKey: config.vapidPublicKey,
        privateKey: config.vapidPrivateKey
      })
    : undefined;

  return {
    pushConfig: {
      enabled: Boolean(config),
      vapidPublicKey: config?.vapidPublicKey ?? null
    },
    pushEnabled: Boolean(config),
    createService() {
      return createDeploymentNotificationService({
        repository: createPostgresNotificationRepository(options.getDatabaseClient().db),
        cipher,
        pushSender,
        onDispatchError: options.onDispatchError
      });
    }
  };
}

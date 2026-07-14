import { z } from "zod";
import type {
  DeploymentNotification,
  WebPushPublicConfigResponse,
  WebPushSubscriptionInput,
  WebPushSubscriptionResponse
} from "@sketchcatch/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireActiveUserId } from "../auth/current-user.js";
import type { DatabaseClient } from "../db/client.js";
import {
  DeploymentNotificationServiceError,
  type createDeploymentNotificationService
} from "../notifications/deployment-notification-service.js";

type NotificationService = ReturnType<typeof createDeploymentNotificationService>;

const listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const notificationParamsSchema = z.object({
  notificationId: z.string().regex(/^ntf_[a-f\d]{32}$/)
}).strict();
const streamQuerySchema = z.object({
  after: z.string().regex(/^ntf_[a-f\d]{32}$/).optional(),
  once: z.enum(["true", "false"]).optional()
}).strict();
const endpointSchema = z.url().max(2_048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.hash;
}, "Push endpoint must be a credential-free HTTPS URL");
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  expirationTime: z.number().int().safe().positive().max(8_640_000_000_000_000).nullable(),
  keys: z.object({
    auth: z.string().regex(/^[A-Za-z0-9_-]{8,512}$/),
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{8,512}$/)
  }).strict()
}).strict();
const deleteSubscriptionSchema = z.object({ endpoint: endpointSchema }).strict();

export type NotificationRouteOptions = {
  createService: () => NotificationService;
  getDatabaseClient?: () => DatabaseClient;
  pushConfig: WebPushPublicConfigResponse;
  requireUserId?: (request: FastifyRequest) => Promise<string>;
};

export async function registerNotificationRoutes(
  app: FastifyInstance,
  options: NotificationRouteOptions
): Promise<void> {
  const requireUser = options.requireUserId ?? ((request) =>
    requireActiveUserId(request, options.getDatabaseClient));

  app.get("/notifications", async (request, reply) => {
    try {
      const userId = await requireUser(request);
      const query = listQuerySchema.parse(request.query);
      return reply.status(200).send(await options.createService().listInbox(userId, query.limit));
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.patch("/notifications/:notificationId/read", async (request, reply) => {
    try {
      const userId = await requireUser(request);
      const params = notificationParamsSchema.parse(request.params);
      return reply.status(200).send({
        notification: await options.createService().markRead(userId, params.notificationId)
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.post("/notifications/read-all", async (request, reply) => {
    try {
      const userId = await requireUser(request);
      const updatedCount = await options.createService().markAllRead(userId);
      return reply.status(200).send({ updatedCount });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.get("/notifications/push-config", async (request, reply) => {
    try {
      await requireUser(request);
      return reply.status(200).send(options.pushConfig);
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.put("/notifications/push-subscription", async (request, reply) => {
    try {
      const userId = await requireUser(request);
      const subscription = subscriptionSchema.parse(request.body) as WebPushSubscriptionInput;
      const stored = await options.createService().saveSubscription(userId, subscription);
      const response: WebPushSubscriptionResponse = {
        subscriptionId: stored.id,
        expiresAt: stored.expiresAt?.toISOString() ?? null
      };
      return reply.status(200).send(response);
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.delete("/notifications/push-subscription", async (request, reply) => {
    try {
      const userId = await requireUser(request);
      const body = deleteSubscriptionSchema.parse(request.body);
      await options.createService().deleteSubscription(userId, body.endpoint);
      return reply.status(204).send();
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.get("/notifications/stream", async (request, reply) => {
    try {
      const userId = await requireUser(request);
      const query = streamQuerySchema.parse(request.query);
      return streamNotifications({
        userId,
        after: query.after,
        once: query.once === "true",
        request,
        reply,
        service: options.createService()
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}

async function streamNotifications(input: {
  userId: string;
  after: string | undefined;
  once: boolean;
  request: FastifyRequest;
  reply: FastifyReply;
  service: NotificationService;
}): Promise<void> {
  input.reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    Vary: "Authorization"
  });
  input.reply.hijack();
  let cursor = input.after;
  let closed = false;
  let reading = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    if (!input.reply.raw.writableEnded && !input.reply.raw.destroyed) input.reply.raw.end();
  };
  const writeNotifications = async () => {
    if (closed || reading) return;
    reading = true;
    try {
      const notifications = await input.service.listAfter(input.userId, cursor);
      for (const notification of notifications) {
        if (closed) return;
        writeNotificationEvent(input.reply, notification);
        cursor = notification.id;
      }
    } finally {
      reading = false;
    }
  };
  const pollTimer = setInterval(() => void writeNotifications().catch(close), 2_000);
  const heartbeatTimer = setInterval(() => {
    if (!closed) input.reply.raw.write(": heartbeat\n\n");
  }, 15_000);
  pollTimer.unref();
  heartbeatTimer.unref();
  input.request.raw.on("close", close);
  try {
    await writeNotifications();
  } catch {
    close();
  }
  if (input.once) close();
}

function writeNotificationEvent(reply: FastifyReply, notification: DeploymentNotification): void {
  reply.raw.write(
    `id: ${notification.id}\nevent: notification\ndata: ${JSON.stringify(notification)}\n\n`
  );
}

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ error: "bad_request", message: error.message });
  }
  if (error instanceof DeploymentNotificationServiceError) {
    const status = error.code === "not_found" ? 404 : error.code === "service_unavailable" ? 503 : 400;
    return reply.status(status).send({ error: error.code, message: error.message });
  }
  throw error;
}

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql
} from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  notificationOutbox,
  notifications,
  webPushSubscriptions
} from "../db/schema.js";
import type {
  ClaimedNotificationDelivery,
  DeploymentNotificationRecord,
  NotificationRepository
} from "./deployment-notification-service.js";

const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function createPostgresNotificationRepository(db: Database): NotificationRepository {
  return {
    async listInbox(userId, limit) {
      const [rows, unread] = await Promise.all([
        db
          .select()
          .from(notifications)
          .where(and(eq(notifications.userId, userId), gt(notifications.expiresAt, sql`now()`)))
          .orderBy(desc(notifications.createdAt), desc(notifications.id))
          .limit(limit),
        db
          .select({ value: count() })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              isNull(notifications.readAt),
              gt(notifications.expiresAt, sql`now()`)
            )
          )
      ]);
      return {
        notifications: rows.map(toNotificationRecord),
        unreadCount: unread[0]?.value ?? 0
      };
    },

    async listAfter(userId, afterNotificationId, limit) {
      if (!afterNotificationId) {
        const rows = await db
          .select()
          .from(notifications)
          .where(and(eq(notifications.userId, userId), gt(notifications.expiresAt, sql`now()`)))
          .orderBy(desc(notifications.createdAt), desc(notifications.id))
          .limit(limit);
        return rows.reverse().map(toNotificationRecord);
      }
      const [anchor] = await db
        .select({ createdAt: notifications.createdAt, id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.id, afterNotificationId)
          )
        );
      if (!anchor) return [];
      const rows = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            gt(notifications.expiresAt, sql`now()`),
            or(
              gt(notifications.createdAt, anchor.createdAt),
              and(eq(notifications.createdAt, anchor.createdAt), gt(notifications.id, anchor.id))
            )
          )
        )
        .orderBy(asc(notifications.createdAt), asc(notifications.id))
        .limit(limit);
      return rows.map(toNotificationRecord);
    },

    async markRead(userId, notificationId, readAt) {
      const [row] = await db
        .update(notifications)
        .set({ readAt })
        .where(and(eq(notifications.userId, userId), eq(notifications.id, notificationId)))
        .returning();
      return row ? toNotificationRecord(row) : undefined;
    },

    async markAllRead(userId, readAt) {
      const rows = await db
        .update(notifications)
        .set({ readAt })
        .where(
          and(
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
            gt(notifications.expiresAt, sql`now()`)
          )
        )
        .returning({ id: notifications.id });
      return rows.length;
    },

    async upsertSubscription(input) {
      const [row] = await db
        .insert(webPushSubscriptions)
        .values(input)
        .onConflictDoUpdate({
          target: webPushSubscriptions.endpointHash,
          set: {
            userId: input.userId,
            encryptedPayload: input.encryptedPayload,
            keyVersion: input.keyVersion,
            expiresAt: input.expiresAt,
            failureCount: 0,
            disabledAt: null,
            createdAt: input.createdAt,
            updatedAt: input.updatedAt
          }
        })
        .returning();
      if (!row) throw new Error("Failed to persist Web Push subscription");
      return row;
    },

    async deleteSubscription(userId, endpointHash) {
      const rows = await db
        .delete(webPushSubscriptions)
        .where(
          and(
            eq(webPushSubscriptions.userId, userId),
            eq(webPushSubscriptions.endpointHash, endpointHash)
          )
        )
        .returning({ id: webPushSubscriptions.id });
      return rows.length > 0;
    },

    listActiveSubscriptions(userId) {
      return db
        .select()
        .from(webPushSubscriptions)
        .where(
          and(
            eq(webPushSubscriptions.userId, userId),
            isNull(webPushSubscriptions.disabledAt)
          )
        );
    },

    async disableSubscription(subscriptionId, disabledAt) {
      await db
        .update(webPushSubscriptions)
        .set({
          disabledAt,
          failureCount: sql`${webPushSubscriptions.failureCount} + 1`,
          updatedAt: disabledAt
        })
        .where(eq(webPushSubscriptions.id, subscriptionId));
    },

    claimPending(now, limit) {
      return db.transaction(async (tx) => {
        const staleLease = new Date(now.getTime() - PROCESSING_LEASE_MS);
        const candidates = await tx
          .select({
            id: notificationOutbox.id,
            notificationId: notificationOutbox.notificationId,
            attemptCount: notificationOutbox.attemptCount
          })
          .from(notificationOutbox)
          .innerJoin(notifications, eq(notifications.id, notificationOutbox.notificationId))
          .where(
            and(
              gt(notifications.expiresAt, now),
              or(
                and(
                  inArray(notificationOutbox.status, ["pending", "retry"]),
                  lte(notificationOutbox.nextAttemptAt, now)
                ),
                and(
                  eq(notificationOutbox.status, "processing"),
                  or(
                    isNull(notificationOutbox.lockedAt),
                    lt(notificationOutbox.lockedAt, staleLease)
                  )
                )
              )
            )
          )
          .orderBy(asc(notificationOutbox.nextAttemptAt), asc(notificationOutbox.id))
          .limit(limit)
          .for("update", { skipLocked: true });
        if (!candidates.length) return [];
        const ids = candidates.map((item) => item.id);
        await tx
          .update(notificationOutbox)
          .set({ status: "processing", lockedAt: now, updatedAt: now })
          .where(inArray(notificationOutbox.id, ids));
        const rows = await tx
          .select({
            outboxId: notificationOutbox.id,
            attemptCount: notificationOutbox.attemptCount,
            notification: notifications
          })
          .from(notificationOutbox)
          .innerJoin(notifications, eq(notifications.id, notificationOutbox.notificationId))
          .where(inArray(notificationOutbox.id, ids));
        return rows.map((row): ClaimedNotificationDelivery => ({
          outboxId: row.outboxId,
          userId: row.notification.userId,
          attemptCount: row.attemptCount,
          notification: toNotificationRecord(row.notification)
        }));
      });
    },

    async markDelivered(outboxId, deliveredAt, providerStatusCode) {
      await db
        .update(notificationOutbox)
        .set({
          status: "delivered",
          attemptCount: sql`${notificationOutbox.attemptCount} + 1`,
          deliveredAt,
          providerStatusCode,
          lockedAt: null,
          lastErrorCode: null,
          updatedAt: deliveredAt
        })
        .where(eq(notificationOutbox.id, outboxId));
    },

    async markRetry(outboxId, nextAttemptAt, errorCode) {
      await db
        .update(notificationOutbox)
        .set({
          status: "retry",
          attemptCount: sql`${notificationOutbox.attemptCount} + 1`,
          nextAttemptAt,
          lockedAt: null,
          lastErrorCode: errorCode,
          updatedAt: sql`now()`
        })
        .where(eq(notificationOutbox.id, outboxId));
    },

    async markDead(outboxId, errorCode, failedAt) {
      await db
        .update(notificationOutbox)
        .set({
          status: "dead",
          attemptCount: sql`${notificationOutbox.attemptCount} + 1`,
          lockedAt: null,
          lastErrorCode: errorCode,
          updatedAt: failedAt
        })
        .where(eq(notificationOutbox.id, outboxId));
    },

    async cleanupExpired(cutoff) {
      const currentTime = new Date(cutoff.getTime() + RETENTION_MS);
      return db.transaction(async (tx) => {
        const removedNotifications = await tx
          .delete(notifications)
          .where(or(lte(notifications.createdAt, cutoff), lte(notifications.expiresAt, currentTime)))
          .returning({ id: notifications.id });
        const removedSubscriptions = await tx
          .delete(webPushSubscriptions)
          .where(
            or(
              lte(webPushSubscriptions.expiresAt, currentTime),
              lte(webPushSubscriptions.disabledAt, cutoff)
            )
          )
          .returning({ id: webPushSubscriptions.id });
        return {
          notifications: removedNotifications.length,
          subscriptions: removedSubscriptions.length
        };
      });
    }
  };
}

function toNotificationRecord(row: typeof notifications.$inferSelect): DeploymentNotificationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    source: row.source,
    sourceId: row.sourceId,
    status: row.status,
    title: row.title,
    body: row.body,
    actionUrl: row.actionUrl,
    readAt: row.readAt,
    createdAt: row.createdAt
  };
}

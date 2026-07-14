import type {
  DeploymentNotification,
  DeploymentNotificationListResponse,
  WebPushPublicConfigResponse,
  WebPushSubscriptionInput,
  WebPushSubscriptionResponse
} from "@sketchcatch/types";
import { apiFetch, buildApiUrl, refreshAuthSession } from "./api-client";
import { readStoredAuthSession } from "./auth-storage";

export function listDeploymentNotifications(): Promise<DeploymentNotificationListResponse> {
  return apiFetch("/notifications?limit=100", { auth: true });
}

export async function markDeploymentNotificationRead(
  notificationId: string
): Promise<DeploymentNotification> {
  const response = await apiFetch<{ notification: DeploymentNotification }>(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    { auth: true, method: "PATCH" }
  );
  return response.notification;
}

export function markAllDeploymentNotificationsRead(): Promise<{ updatedCount: number }> {
  return apiFetch("/notifications/read-all", { auth: true, method: "POST" });
}

export function getWebPushPublicConfig(): Promise<WebPushPublicConfigResponse> {
  return apiFetch("/notifications/push-config", { auth: true });
}

export function saveWebPushSubscription(
  subscription: WebPushSubscriptionInput
): Promise<WebPushSubscriptionResponse> {
  return apiFetch("/notifications/push-subscription", {
    auth: true,
    method: "PUT",
    body: subscription
  });
}

export function deleteWebPushSubscription(endpoint: string): Promise<void> {
  return apiFetch("/notifications/push-subscription", {
    auth: true,
    method: "DELETE",
    body: { endpoint }
  });
}

export async function streamDeploymentNotifications(input: {
  after?: string | undefined;
  signal: AbortSignal;
  onNotification: (notification: DeploymentNotification) => void;
}): Promise<void> {
  return readStream(input, true);
}

async function readStream(
  input: {
    after?: string | undefined;
    signal: AbortSignal;
    onNotification: (notification: DeploymentNotification) => void;
  },
  retryOnUnauthorized: boolean
): Promise<void> {
  const session = readStoredAuthSession();
  const headers = new Headers({ Accept: "text/event-stream" });
  if (session) headers.set("Authorization", `Bearer ${session.accessToken}`);
  const params = new URLSearchParams();
  if (input.after) params.set("after", input.after);
  const query = params.size ? `?${params.toString()}` : "";
  const response = await fetch(buildApiUrl(`/notifications/stream${query}`), {
    credentials: "include",
    headers,
    signal: input.signal
  });
  if (response.status === 401 && retryOnUnauthorized && (await refreshAuthSession())) {
    return readStream(input, false);
  }
  if (!response.ok || !response.body) {
    throw new Error(`Notification stream failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!input.signal.aborted) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseNotificationEvent(block);
      if (event) input.onNotification(event);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
}

function parseNotificationEvent(block: string): DeploymentNotification | null {
  const lines = block.split("\n");
  if (!lines.includes("event: notification")) return null;
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return isNotification(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isNotification(value: unknown): value is DeploymentNotification {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.projectId === "string" &&
    (item.source === "direct_deployment" || item.source === "gitops_pipeline") &&
    typeof item.sourceId === "string" &&
    (item.status === "succeeded" || item.status === "failed" || item.status === "cancelled") &&
    typeof item.title === "string" &&
    typeof item.body === "string" &&
    typeof item.actionUrl === "string" &&
    (item.readAt === null || typeof item.readAt === "string") &&
    typeof item.createdAt === "string"
  );
}

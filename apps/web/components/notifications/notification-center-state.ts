import type {
  DeploymentNotification,
  DeploymentNotificationListResponse
} from "@sketchcatch/types";

export type NotificationCenterState = {
  notifications: readonly DeploymentNotification[];
  unreadCount: number;
};

export function createNotificationCenterState(): NotificationCenterState {
  return { notifications: [], unreadCount: 0 };
}

export function replaceNotificationCenterState(
  response: DeploymentNotificationListResponse
): NotificationCenterState {
  return {
    notifications: [...response.notifications].sort(compareNewest),
    unreadCount: response.unreadCount
  };
}

export function mergeNotification(
  state: NotificationCenterState,
  notification: DeploymentNotification
): NotificationCenterState {
  const existing = state.notifications.find((item) => item.id === notification.id);
  const notifications = [
    notification,
    ...state.notifications.filter((item) => item.id !== notification.id)
  ].sort(compareNewest);
  const unreadCount = Math.max(
    0,
    state.unreadCount
      - Number(existing?.readAt === null)
      + Number(notification.readAt === null)
  );
  return { notifications, unreadCount };
}

export function markNotificationReadLocally(
  state: NotificationCenterState,
  notificationId: string,
  readAt: string
): NotificationCenterState {
  const target = state.notifications.find((item) => item.id === notificationId);
  if (!target || target.readAt) return state;
  return {
    notifications: state.notifications.map((item) =>
      item.id === notificationId ? { ...item, readAt } : item
    ),
    unreadCount: Math.max(0, state.unreadCount - 1)
  };
}

export function markAllNotificationsReadLocally(
  state: NotificationCenterState,
  readAt: string
): NotificationCenterState {
  return {
    notifications: state.notifications.map((item) =>
      item.readAt ? item : { ...item, readAt }
    ),
    unreadCount: 0
  };
}

function compareNewest(left: DeploymentNotification, right: DeploymentNotification): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

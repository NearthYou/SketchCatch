type OpenDeploymentNotificationInput = {
  readonly actionUrl: string;
  readonly close: () => void;
  readonly markRead: () => Promise<void>;
  readonly navigate: (href: string) => void;
};

export function openDeploymentNotification({
  actionUrl,
  close,
  markRead,
  navigate
}: OpenDeploymentNotificationInput): Promise<void> {
  const readRequest = markRead();
  close();
  navigate(actionUrl);
  return readRequest;
}

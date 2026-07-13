import type { Deployment } from "@sketchcatch/types";
import { createPipelineNotificationKey } from "./cicd-console-state";

export type WorkspaceNotificationStatus = "succeeded" | "failed";
export type WorkspaceNotificationEvent = {
  readonly type: "pipeline_terminal" | "direct_terminal";
  readonly runId: string;
  readonly status: string;
  readonly title: string;
  readonly body: string;
};

export type WorkspaceNotificationItem = {
  readonly key: string;
  readonly status: WorkspaceNotificationStatus;
  readonly title: string;
  readonly body: string;
};

export type WorkspaceNotificationState = {
  readonly items: readonly WorkspaceNotificationItem[];
  readonly notifiedKeys: readonly string[];
};

export type BrowserNotificationAvailability =
  | NotificationPermission
  | "unsupported";

export function createInitialWorkspaceNotificationState(
  notifiedKeys: readonly string[] = []
): WorkspaceNotificationState {
  return {
    items: [],
    notifiedKeys: [...new Set(notifiedKeys)]
  };
}

export function reduceWorkspaceNotifications(
  state: WorkspaceNotificationState,
  event: WorkspaceNotificationEvent
): WorkspaceNotificationState {
  if (event.status !== "succeeded" && event.status !== "failed") {
    return state;
  }

  const key = createPipelineNotificationKey(event.runId, event.status);
  if (state.notifiedKeys.includes(key)) {
    return state;
  }

  return {
    items: [
      ...state.items,
      {
        key,
        status: event.status,
        title: event.title,
        body: event.body
      }
    ],
    notifiedKeys: [...state.notifiedKeys, key]
  };
}

export function shouldCreateBrowserNotification(
  availability: BrowserNotificationAvailability
): boolean {
  return availability === "granted";
}

export function getNotifiableDirectDeploymentTransitions(
  previousDeployments: readonly Deployment[],
  nextDeployments: readonly Deployment[],
  selectedDeploymentId?: string
): Deployment[] {
  const previousById = new Map(
    previousDeployments.map((deployment) => [deployment.id, deployment] as const)
  );

  return nextDeployments.filter((next) => {
    if (selectedDeploymentId && next.id !== selectedDeploymentId) {
      return false;
    }
    const previous = previousById.get(next.id);
    return Boolean(
      previous &&
      !isTerminalDirectDeployment(previous.status) &&
      previous.currentPlanOperation === "apply" &&
      next.currentPlanOperation === "apply" &&
      (next.status === "SUCCESS" || next.status === "FAILED")
    );
  });
}

function isTerminalDirectDeployment(status: Deployment["status"]): boolean {
  return (
    status === "SUCCESS" ||
    status === "FAILED" ||
    status === "CANCELLED" ||
    status === "DESTROYED"
  );
}

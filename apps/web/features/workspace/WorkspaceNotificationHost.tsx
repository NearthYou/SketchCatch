"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  listDeployments,
  listGitCicdPipelineRuns,
  refreshProjectGitCicdPipelineRuns
} from "./api";
import {
  createInitialWorkspaceNotificationState,
  reduceWorkspaceNotifications,
  shouldCreateBrowserNotification,
  type BrowserNotificationAvailability,
  type WorkspaceNotificationEvent,
  type WorkspaceNotificationState
} from "./workspace-notifications";
import {
  createInitialWorkspaceDeploymentObservation,
  getWorkspaceDeploymentObserverIntervalMs,
  observeWorkspaceDeploymentSnapshots,
  type WorkspaceDeploymentSnapshotUpdate
} from "./workspace-deployment-observer";
import styles from "./workspace.module.css";

const SESSION_STORAGE_KEY = "sketchcatch:workspace-notification-keys";

export function WorkspaceNotificationHost({
  children,
  projectId
}: {
  readonly children: ReactNode;
  readonly projectId: string;
}) {
  const [state, setState] = useState<WorkspaceNotificationState>(() =>
    createInitialWorkspaceNotificationState(readStoredNotificationKeys())
  );
  const stateRef = useRef(state);
  const [browserAvailability, setBrowserAvailability] =
    useState<BrowserNotificationAvailability>(() => getBrowserNotificationAvailability());

  const notify = useCallback((event: WorkspaceNotificationEvent): void => {
    const next = reduceWorkspaceNotifications(stateRef.current, event);
    if (next === stateRef.current) {
      return;
    }

    stateRef.current = next;
    setState(next);
    storeNotificationKeys(next.notifiedKeys);

    try {
      if (shouldCreateBrowserNotification(getBrowserNotificationAvailability())) {
        const notificationKey = next.notifiedKeys.at(-1)!;
        new window.Notification(event.title, {
          body: event.body,
          tag: notificationKey
        });
      }
    } catch {
      // The already-enqueued in-app notification remains the fallback.
    }
  }, []);

  async function requestBrowserNotificationPermission(): Promise<void> {
    if (!("Notification" in window)) {
      setBrowserAvailability("unsupported");
      return;
    }

    try {
      const permission = await window.Notification.requestPermission();
      setBrowserAvailability(permission);
    } catch {
      setBrowserAvailability("unsupported");
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;
    let observation = createInitialWorkspaceDeploymentObservation();

    async function poll(): Promise<void> {
      const [directResult, pipelineResult] = await Promise.allSettled([
        listDeployments(projectId),
        loadObservedPipelineRuns(projectId)
      ]);
      if (cancelled) {
        return;
      }

      const update: WorkspaceDeploymentSnapshotUpdate = {
        ...(directResult.status === "fulfilled"
          ? { deployments: directResult.value }
          : {}),
        ...(pipelineResult.status === "fulfilled"
          ? { pipelineRuns: pipelineResult.value }
          : {})
      };
      const result = observeWorkspaceDeploymentSnapshots(observation, update);
      observation = result.state;

      result.directTransitions.forEach((deployment) => {
        const succeeded = deployment.status === "SUCCESS";
        notify({
          type: "direct_terminal",
          runId: deployment.id,
          status: succeeded ? "succeeded" : "failed",
          title: succeeded ? "배포 완료" : "배포 실패",
          body: `프로젝트 ${projectId} · Direct · ${deployment.id.slice(0, 8)} · ${succeeded ? "성공" : "실패"}`
        });
      });
      result.pipelineTransitions.forEach((run) => {
        const succeeded = run.status === "succeeded";
        notify({
          type: "pipeline_terminal",
          runId: run.id,
          status: run.status,
          title: succeeded ? "배포 완료" : "배포 실패",
          body: `프로젝트 ${projectId} · ${run.branch} · ${run.commitSha.slice(0, 8)} · ${succeeded ? "성공" : "실패"}`
        });
      });

      timeoutId = window.setTimeout(
        () => void poll(),
        getWorkspaceDeploymentObserverIntervalMs(observation)
      );
    }

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [notify, projectId]);

  return (
    <>
      {children}
      <aside className={styles.workspaceNotificationHost} aria-label="배포 알림">
        <button onClick={requestBrowserNotificationPermission} type="button">
          브라우저 알림 켜기
        </button>
        {browserAvailability === "denied" ? (
          <p>브라우저 알림이 차단되어 앱 안에서 알려드립니다.</p>
        ) : browserAvailability === "unsupported" ? (
          <p>이 브라우저에서는 앱 안에서 알려드립니다.</p>
        ) : null}
        {state.items.length > 0 ? (
          <ol aria-live="polite">
            {state.items.map((item) => (
              <li data-status={item.status} key={item.key} role="status">
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </aside>
    </>
  );
}

async function loadObservedPipelineRuns(projectId: string) {
  const discovery = await refreshProjectGitCicdPipelineRuns(projectId);
  if (discovery.stale) {
    throw new Error("Pipeline Run discovery is stale");
  }
  const response = await listGitCicdPipelineRuns(projectId, { limit: 50 });
  return response.runs;
}

function getBrowserNotificationAvailability(): BrowserNotificationAvailability {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return window.Notification.permission;
}

function readStoredNotificationKeys(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!storedValue) {
      return [];
    }
    const parsed: unknown = JSON.parse(storedValue);
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
}

function storeNotificationKeys(keys: readonly string[]): void {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // In-app notifications still work when session storage is unavailable.
  }
}

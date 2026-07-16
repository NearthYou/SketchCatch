"use client";

import { Bell, CheckCheck, X } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { WebPushSubscriptionInput } from "@sketchcatch/types";
import { useAuth } from "../auth/auth-provider";
import {
  deleteWebPushSubscription,
  getWebPushPublicConfig,
  listDeploymentNotifications,
  markAllDeploymentNotificationsRead,
  markDeploymentNotificationRead,
  saveWebPushSubscription,
  streamDeploymentNotifications
} from "../../lib/notifications-api";
import {
  createNotificationCenterState,
  markAllNotificationsReadLocally,
  markNotificationReadLocally,
  mergeNotification,
  replaceNotificationCenterState,
  type NotificationCenterState
} from "./notification-center-state";
import { getDeploymentNotificationCenterPlacement } from "./notification-center-placement";
import styles from "./deployment-notification-center.module.css";

type PushState = "idle" | "enabling" | "enabled" | "denied" | "unsupported" | "unavailable" | "error";

type NotificationCenterContextValue = {
  readonly close: () => void;
  readonly disablePush: () => Promise<void>;
  readonly enablePush: () => Promise<void>;
  readonly open: boolean;
  readonly openNotification: (notificationId: string, actionUrl: string) => Promise<void>;
  readonly pushState: PushState;
  readonly readAll: () => Promise<void>;
  readonly state: NotificationCenterState;
  readonly toggle: () => void;
};

const NotificationCenterContext = createContext<NotificationCenterContextValue | null>(null);

export function DeploymentNotificationCenter({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const { status } = useAuth();
  const [state, setState] = useState(createNotificationCenterState);
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<PushState>("idle");
  const [inboxReady, setInboxReady] = useState(false);
  const cursorRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (status !== "authenticated") {
      setState(createNotificationCenterState());
      cursorRef.current = undefined;
      setInboxReady(false);
      return;
    }
    let active = true;
    setInboxReady(false);
    void listDeploymentNotifications()
      .then((response) => {
        if (!active) return;
        setState(replaceNotificationCenterState(response));
        cursorRef.current = response.notifications[0]?.id;
        setInboxReady(true);
      })
      .catch(() => undefined)
    return () => { active = false; };
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || !inboxReady) return;
    const controller = new AbortController();
    let retryTimer: number | undefined;
    let retryMs = 1_000;
    const connect = async () => {
      try {
        await streamDeploymentNotifications({
          after: cursorRef.current,
          signal: controller.signal,
          onNotification(notification) {
            cursorRef.current = notification.id;
            setState((current) => mergeNotification(current, notification));
          }
        });
        retryMs = 1_000;
      } catch {
        if (controller.signal.aborted) return;
      }
      if (!controller.signal.aborted) {
        retryTimer = window.setTimeout(() => void connect(), retryMs);
        retryMs = Math.min(retryMs * 2, 30_000);
      }
    };
    void connect();
    return () => {
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [inboxReady, status]);

  const readNotification = useCallback(async (notificationId: string): Promise<void> => {
    const readAt = new Date().toISOString();
    setState((current) => markNotificationReadLocally(current, notificationId, readAt));
    try {
      const saved = await markDeploymentNotificationRead(notificationId);
      setState((current) => mergeNotification(current, saved));
    } catch {
      void listDeploymentNotifications().then((response) =>
        setState(replaceNotificationCenterState(response))
      ).catch(() => undefined);
    }
  }, []);

  const openNotification = useCallback(async (notificationId: string, actionUrl: string): Promise<void> => {
    await readNotification(notificationId);
    window.location.assign(actionUrl);
  }, [readNotification]);

  const readAll = useCallback(async (): Promise<void> => {
    const readAt = new Date().toISOString();
    setState((current) => markAllNotificationsReadLocally(current, readAt));
    try {
      await markAllDeploymentNotificationsRead();
    } catch {
      void listDeploymentNotifications().then((response) =>
        setState(replaceNotificationCenterState(response))
      ).catch(() => undefined);
    }
  }, []);

  const enablePush = useCallback(async (): Promise<void> => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      return;
    }
    setPushState("enabling");
    try {
      const permission = await window.Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("denied");
        return;
      }
      const config = await getWebPushPublicConfig();
      if (!config.enabled || !config.vapidPublicKey) {
        setPushState("unavailable");
        return;
      }
      const registration = await navigator.serviceWorker.register("/notification-sw.js", {
        scope: "/"
      });
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToArrayBuffer(config.vapidPublicKey)
      });
      await saveWebPushSubscription(toSubscriptionInput(subscription));
      setPushState("enabled");
    } catch {
      setPushState("error");
    }
  }, []);

  const disablePush = useCallback(async (): Promise<void> => {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await deleteWebPushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setPushState("idle");
    } catch {
      setPushState("error");
    }
  }, []);

  const contextValue = useMemo<NotificationCenterContextValue>(
    () => ({
      close: () => setOpen(false),
      disablePush,
      enablePush,
      open,
      openNotification,
      pushState,
      readAll,
      state,
      toggle: () => setOpen((value) => !value)
    }),
    [disablePush, enablePush, open, openNotification, pushState, readAll, state]
  );

  return (
    <NotificationCenterContext.Provider value={contextValue}>
      {children}
      {status === "authenticated" &&
      getDeploymentNotificationCenterPlacement(pathname) === "floating" ? (
        <NotificationCenterSurface placement="floating" />
      ) : null}
    </NotificationCenterContext.Provider>
  );
}

export function WorkspaceDeploymentNotificationCenterSlot() {
  const pathname = usePathname();

  if (getDeploymentNotificationCenterPlacement(pathname) !== "workspace") return null;
  return <NotificationCenterSurface placement="workspace" />;
}

function NotificationCenterSurface({
  placement
}: {
  readonly placement: "floating" | "workspace";
}) {
  const context = useContext(NotificationCenterContext);

  if (!context) return null;
  const {
    close,
    disablePush,
    enablePush,
    open,
    openNotification,
    pushState,
    readAll,
    state,
    toggle
  } = context;

  return (
    <aside className={styles.center} data-placement={placement} aria-label="배포 알림">
      <button
        aria-expanded={open}
        aria-label={`배포 알림${state.unreadCount ? ` ${state.unreadCount}개 읽지 않음` : ""}`}
        className={styles.trigger}
        onClick={toggle}
        type="button"
      >
        <Bell aria-hidden="true" size={19} />
        {state.unreadCount > 0 ? (
          <span
            aria-label={`${state.unreadCount}개 읽지 않은 배포 알림`}
            className={styles.unreadCountBadge}
          >
            {Math.min(state.unreadCount, 99)}
          </span>
        ) : null}
      </button>
      {open ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <strong>배포 알림</strong>
              <span>{state.unreadCount}개 읽지 않음</span>
            </div>
            <button aria-label="알림 닫기" onClick={close} type="button">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <div className={styles.controls}>
            <button disabled={state.unreadCount === 0} onClick={() => void readAll()} type="button">
              <CheckCheck aria-hidden="true" size={15} /> 모두 읽음
            </button>
            {pushState === "enabled" ? (
              <button onClick={() => void disablePush()} type="button">브라우저 알림 끄기</button>
            ) : (
              <button disabled={pushState === "enabling"} onClick={() => void enablePush()} type="button">
                {pushState === "enabling" ? "연결 중" : "브라우저 알림 켜기"}
              </button>
            )}
          </div>
          {pushState === "denied" ? <p className={styles.notice}>권한이 거부되어 Inbox로만 알립니다.</p> : null}
          {pushState === "unsupported" ? <p className={styles.notice}>이 브라우저는 Web Push를 지원하지 않습니다.</p> : null}
          {pushState === "unavailable" ? <p className={styles.notice}>서버 Web Push 설정이 준비되지 않았습니다.</p> : null}
          {pushState === "error" ? <p className={styles.notice}>브라우저 알림 연결을 완료하지 못했습니다.</p> : null}
          {state.notifications.length ? (
            <ol className={styles.list} aria-live="polite">
              {state.notifications.map((item) => (
                <li data-read={item.readAt !== null} key={item.id}>
                  <a
                    href={item.actionUrl}
                    onClick={(event) => {
                      event.preventDefault();
                      void openNotification(item.id, item.actionUrl);
                    }}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <time dateTime={item.createdAt}>{formatCreatedAt(item.createdAt)}</time>
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>아직 배포 알림이 없습니다.</p>
          )}
        </section>
      ) : null}
    </aside>
  );
}

function toSubscriptionInput(subscription: PushSubscription): WebPushSubscriptionInput {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.auth || !json.keys.p256dh) {
    throw new Error("Browser returned an incomplete Push subscription");
  }
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { auth: json.keys.auth, p256dh: json.keys.p256dh }
  };
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

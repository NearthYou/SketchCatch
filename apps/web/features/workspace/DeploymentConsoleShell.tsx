import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { DeliveryModalSummary } from "./DeliveryModalSummary";
import { DirectDeploymentScreen, type DirectDeploymentScreenProps } from "./DirectDeploymentScreen";
import type { LiveObservationSelection } from "./live-observation";
import {
  acknowledgeInitialCicdReturnCommand,
  cancelPendingCicdReturn,
  completePendingCicdReturn,
  completePendingCicdReturnAfterDeployment,
  type InitialCicdReturnCommand,
  type PendingCicdReturn
} from "./cicd-return-command";
import styles from "./workspace.module.css";

export type DeploymentConsoleScreen = "deployment" | "cicd";

export type DeploymentConsoleShellProps = Omit<
  DirectDeploymentScreenProps,
  "onApplyPlanApproved"
> & {
  readonly activeScreen?: DeploymentConsoleScreen | undefined;
  readonly fullScreenOnly?: boolean | undefined;
  readonly initialExpanded?: boolean | undefined;
  readonly initialCicdReturnCommand?: InitialCicdReturnCommand | undefined;
  readonly onActiveScreenChange?: ((screen: DeploymentConsoleScreen) => void) | undefined;
  readonly onExpandedClose?: (() => void) | undefined;
  readonly onInitialCicdReturnCommandReady?: ((cleanedHref: string) => void) | undefined;
  readonly onOpenDelivery?: (() => void) | undefined;
  readonly onOpenLiveObservation?: ((selection?: LiveObservationSelection) => void) | undefined;
  readonly projectName: string;
};

export function DeploymentConsoleShell({
  activeScreen: controlledActiveScreen,
  fullScreenOnly = false,
  initialCicdReturnCommand,
  initialExpanded = false,
  onActiveScreenChange,
  onExpandedClose,
  onInitialCicdReturnCommandReady,
  onOpenDelivery,
  onOpenLiveObservation,
  projectName,
  ...directProps
}: DeploymentConsoleShellProps) {
  const storageKey = `sketchcatch:deployment-console-screen:${directProps.projectId}`;
  const [storedActiveScreen, setStoredActiveScreen] =
    useState<DeploymentConsoleScreen>(initialCicdReturnCommand?.activeScreen ?? "deployment");
  const [pendingCicdReturn, setPendingCicdReturn] = useState<PendingCicdReturn | null>(null);
  const [requestedDirectScope, setRequestedDirectScope] = useState<
    "application" | "full_stack" | null
  >(null);
  const [readinessRefreshRequestId, setReadinessRefreshRequestId] = useState(
    initialCicdReturnCommand ? 1 : 0
  );
  const [isDeploymentExpanded, setIsDeploymentExpanded] = useState(initialExpanded);
  const [confirmationDismissRequestId, setConfirmationDismissRequestId] = useState(0);
  const acknowledgedInitialCicdReturnHrefRef = useRef<string | null>(null);
  const confirmationOpenRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const activeScreen = controlledActiveScreen ?? storedActiveScreen;
  const isDeploymentOverlayOpen = fullScreenOnly || isDeploymentExpanded;

  useEffect(() => {
    if (initialCicdReturnCommand?.projectId === directProps.projectId) {
      setStoredActiveScreen("cicd");
      window.localStorage.setItem(storageKey, "cicd");
      return;
    }
    const storedValue = window.localStorage.getItem(storageKey);
    setStoredActiveScreen(isDeploymentConsoleScreen(storedValue) ? storedValue : "deployment");
  }, [directProps.projectId, initialCicdReturnCommand, storageKey]);

  useEffect(() => {
    if (!initialCicdReturnCommand || !onInitialCicdReturnCommandReady) {
      return;
    }

    const cleanedHref = acknowledgeInitialCicdReturnCommand({
      command: initialCicdReturnCommand,
      consoleState: {
        projectId: directProps.projectId,
        activeScreen,
        readinessRefreshRequestId
      }
    });
    if (!cleanedHref || acknowledgedInitialCicdReturnHrefRef.current === cleanedHref) {
      return;
    }

    acknowledgedInitialCicdReturnHrefRef.current = cleanedHref;
    onInitialCicdReturnCommandReady(cleanedHref);
  }, [
    activeScreen,
    directProps.projectId,
    initialCicdReturnCommand,
    onInitialCicdReturnCommandReady,
    readinessRefreshRequestId
  ]);

  useEffect(() => {
    if (!isDeploymentOverlayOpen) {
      return;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        if (confirmationOpenRef.current) {
          setConfirmationDismissRequestId((requestId) => requestId + 1);
          return;
        }
        close();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        (
          document.querySelector<HTMLElement>("[data-deployment-console-trigger]") ?? previousFocus
        )?.focus();
      });
    };
  }, [isDeploymentOverlayOpen]);

  function close(): void {
    setPendingCicdReturn((pending) => cancelPendingCicdReturn(pending));
    setRequestedDirectScope(null);
    setIsDeploymentExpanded(false);
    onExpandedClose?.();
  }

  function selectScreen(
    screen: DeploymentConsoleScreen,
    options: { readonly preservePendingCicdReturn?: boolean } = {}
  ): void {
    if (!options.preservePendingCicdReturn) {
      setPendingCicdReturn((pending) => cancelPendingCicdReturn(pending));
    }
    setStoredActiveScreen(screen);
    window.localStorage.setItem(storageKey, screen);
    onActiveScreenChange?.(screen);
  }

  const screenBody = (
    <div className={styles.deploymentConsoleScreenBody}>
      <div hidden={activeScreen !== "deployment"}>
        <DirectDeploymentScreen
          {...directProps}
          confirmationDismissRequestId={confirmationDismissRequestId}
          onConfirmationStateChange={(isOpen) => {
            confirmationOpenRef.current = isOpen;
          }}
          onOpenLiveObservation={onOpenLiveObservation}
          requestedScope={requestedDirectScope}
          onApplyPlanApproved={(deployment) => {
            const completed = completePendingCicdReturn({
              pending: pendingCicdReturn,
              approvedDeployment: deployment,
              currentRefreshRequestId: readinessRefreshRequestId
            });
            if (!completed) {
              return;
            }
            setPendingCicdReturn(completed.pending);
            setReadinessRefreshRequestId(completed.readinessRefreshRequestId);
            selectScreen(completed.activeScreen, { preservePendingCicdReturn: true });
          }}
          onDeploymentSucceeded={(deployment) => {
            const completed = completePendingCicdReturnAfterDeployment({
              pending: pendingCicdReturn,
              deployment,
              currentRefreshRequestId: readinessRefreshRequestId
            });
            if (!completed) return;
            setPendingCicdReturn(completed.pending);
            setRequestedDirectScope(null);
            setReadinessRefreshRequestId(completed.readinessRefreshRequestId);
            selectScreen(completed.activeScreen, { preservePendingCicdReturn: true });
          }}
        />
      </div>
      <div hidden={activeScreen !== "cicd"}>
        <DeliveryModalSummary
          onOpenDelivery={onOpenDelivery ?? close}
          projectId={directProps.projectId}
        />
      </div>
    </div>
  );

  function renderScreenContent(showCloseButton: boolean) {
    return (
      <>
        <header className={styles.deploymentConsoleHeader}>
          <nav className={styles.deploymentConsoleScreenNavigation} aria-label="배포 실행 경로">
            <button
              aria-pressed={activeScreen === "deployment"}
              onClick={() => selectScreen("deployment")}
              type="button"
            >
              배포
            </button>
            <button
              aria-pressed={activeScreen === "cicd"}
              onClick={() => selectScreen("cicd")}
              type="button"
            >
              CI/CD
            </button>
          </nav>
          {showCloseButton ? (
            <button
              aria-label="배포 모달 닫기"
              className={styles.deploymentExpandedCloseButton}
              onClick={close}
              ref={closeButtonRef}
              type="button"
            >
              <X size={18} aria-hidden="true" />
            </button>
          ) : null}
        </header>
        {screenBody}
      </>
    );
  }

  return (
    <div className={fullScreenOnly ? styles.deploymentPanelFullscreenHost : styles.deploymentPanel}>
      {!fullScreenOnly ? (
        <header className={styles.deploymentHeader}>
          <div className={styles.deploymentHeaderTop}>
            <div>
              <p className={styles.projectEyebrow}>Deployment</p>
              <h2>{projectName}</h2>
            </div>
            <button
              aria-label="Deployment 패널 확장"
              className={styles.deploymentExpandButton}
              onClick={() => setIsDeploymentExpanded(true)}
              type="button"
            >
              <Maximize2 size={16} aria-hidden="true" />
            </button>
          </div>
        </header>
      ) : null}
      {!fullScreenOnly ? (
        <div className={styles.deploymentPanelContent}>{renderScreenContent(false)}</div>
      ) : null}
      {isDeploymentOverlayOpen ? (
        <div
          aria-label="Deployment console"
          aria-modal="true"
          className={styles.deploymentExpandedOverlay}
          onClick={(event) => event.target === event.currentTarget && close()}
          role="dialog"
        >
          <div className={styles.deploymentExpandedShell} ref={dialogRef}>
            <div className={styles.deploymentExpandedBody}>{renderScreenContent(true)}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isDeploymentConsoleScreen(value: string | null): value is DeploymentConsoleScreen {
  return value === "deployment" || value === "cicd";
}

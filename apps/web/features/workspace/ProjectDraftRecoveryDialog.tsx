"use client";

import { useEffect, useRef } from "react";
import styles from "./workspace.module.css";
import { PROJECT_DRAFT_RECOVERY_COPY } from "./project-draft-recovery";

export function ProjectDraftRecoveryDialog({
  errorMessage,
  isLoading,
  onRestoreLocal,
  onUseServer
}: {
  readonly errorMessage?: string | undefined;
  readonly isLoading: boolean;
  readonly onRestoreLocal: () => void;
  readonly onUseServer: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const restoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => restoreButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab") {
        return;
      }

      trapFocusWithin(dialogRef.current, event);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className={`${styles.terraformDialogBackdrop} ${styles.projectDraftRecoveryBackdrop}`}
      role="presentation"
    >
      <section
        aria-labelledby="project-draft-recovery-title"
        aria-modal="true"
        className={`${styles.terraformDialog} ${styles.projectDraftRecoveryDialog}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id="project-draft-recovery-title">{PROJECT_DRAFT_RECOVERY_COPY.title}</h2>
        <p>{PROJECT_DRAFT_RECOVERY_COPY.description}</p>
        <p>{PROJECT_DRAFT_RECOVERY_COPY.serverWarning}</p>
        {errorMessage ? (
          <p className={styles.terraformDialogError} role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className={styles.terraformDialogActions}>
          <button
            className={styles.terraformDialogSecondaryButton}
            disabled={isLoading}
            onClick={onUseServer}
            type="button"
          >
            {isLoading
              ? PROJECT_DRAFT_RECOVERY_COPY.loadingAction
              : PROJECT_DRAFT_RECOVERY_COPY.useServerAction}
          </button>
          <button
            className={styles.terraformDialogPrimaryButton}
            disabled={isLoading}
            onClick={onRestoreLocal}
            ref={restoreButtonRef}
            type="button"
          >
            {PROJECT_DRAFT_RECOVERY_COPY.restoreLocalAction}
          </button>
        </div>
      </section>
    </div>
  );
}

function trapFocusWithin(container: HTMLElement | null, event: KeyboardEvent): void {
  if (!container) {
    return;
  }

  const focusableElements = [...container.querySelectorAll<HTMLElement>("button:not(:disabled)")];
  const first = focusableElements[0];
  const last = focusableElements.at(-1);

  if (!first || !last) {
    event.preventDefault();
    container.focus();
    return;
  }

  if (!container.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
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

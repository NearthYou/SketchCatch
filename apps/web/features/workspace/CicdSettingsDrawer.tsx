"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./delivery-center.module.css";

export function CicdSettingsDrawer({
  children,
  description,
  onClose,
  title
}: {
  readonly children: ReactNode;
  readonly description?: string | undefined;
  readonly onClose: () => void;
  readonly title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={styles.settingsDrawer}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className={styles.settingsDrawerPanel}>
        <header className={styles.settingsDrawerHeader}>
          <div>
            <h3 id={titleId}>{title}</h3>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            aria-label={`${title} 닫기`}
            className={styles.settingsDrawerClose}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className={styles.settingsDrawerBody}>{children}</div>
      </div>
    </dialog>
  );
}

"use client";

import { ChevronRight } from "lucide-react";
import styles from "./delivery-center.module.css";

export type CicdTaskRowTone = "current" | "complete" | "success" | "error" | "pending";

export function CicdTaskRow({
  actionLabel,
  detail,
  disabledReason,
  label,
  onActivate,
  statusLabel,
  statusTone = "pending",
  value
}: {
  readonly actionLabel?: string | undefined;
  readonly detail?: string | undefined;
  readonly disabledReason?: string | undefined;
  readonly label: string;
  readonly onActivate?: (() => void) | undefined;
  readonly statusLabel: string;
  readonly statusTone?: CicdTaskRowTone | undefined;
  readonly value: string;
}) {
  const isActionable = Boolean(onActivate) && !disabledReason;
  const content = (
    <>
      <span className={styles.taskRowContent}>
        <span className={styles.taskRowLabel}>{label}</span>
        <strong className={styles.taskRowValue}>{value}</strong>
        {detail ? <span className={styles.taskRowDetail}>{detail}</span> : null}
      </span>
      <span className={styles.taskRowStatus} data-tone={statusTone}>
        {statusLabel}
      </span>
      {isActionable ? (
        <span className={styles.taskRowAction}>
          {actionLabel}
          <ChevronRight aria-hidden="true" size={18} />
        </span>
      ) : null}
    </>
  );

  return (
    <li className={styles.taskRow} data-actionable={isActionable}>
      {isActionable ? (
        <button className={styles.taskRowButton} onClick={onActivate} type="button">
          {content}
        </button>
      ) : (
        <div className={styles.taskRowStatic}>
          {content}
          {disabledReason ? (
            <span className={styles.taskRowDisabledReason}>{disabledReason}</span>
          ) : null}
        </div>
      )}
    </li>
  );
}

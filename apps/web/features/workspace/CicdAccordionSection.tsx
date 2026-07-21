"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./delivery-center.module.css";

export type CicdAccordionTone = "success" | "warning" | "pending" | "info";

export function CicdAccordionSection({
  children,
  defaultOpen = false,
  ensureOpen = false,
  headerAction,
  icon,
  id,
  metadata,
  openWhen = false,
  statusLabel,
  statusTone,
  title
}: {
  readonly children: ReactNode;
  readonly defaultOpen?: boolean | undefined;
  readonly ensureOpen?: boolean | undefined;
  readonly headerAction?: ReactNode | undefined;
  readonly icon: ReactNode;
  readonly id: string;
  readonly metadata?: ReactNode | undefined;
  readonly openWhen?: boolean | undefined;
  readonly statusLabel: string;
  readonly statusTone: CicdAccordionTone;
  readonly title: string;
}) {
  const generatedId = useId();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = `${id}-${generatedId.replaceAll(":", "")}-panel`;

  useEffect(() => {
    if (ensureOpen || openWhen) setIsOpen(true);
  }, [ensureOpen, openWhen]);

  return (
    <section aria-label={title} className={styles.accordionItem} id={id}>
      <div className={styles.accordionRow}>
        <h4 className={styles.accordionHeading}>
          <button
            aria-controls={panelId}
            aria-expanded={isOpen}
            aria-label={`${title} · ${statusLabel}`}
            className={styles.accordionToggle}
            onClick={() => setIsOpen((current) => (ensureOpen ? true : !current))}
            type="button"
          >
            <span className={styles.accordionIcon} aria-hidden="true">
              {icon}
            </span>
            <span className={styles.accordionTitle}>
              <strong>{title}</strong>
              <span className={styles.accordionStatus} data-tone={statusTone}>
                <i aria-hidden="true" />
                {statusLabel}
              </span>
            </span>
            <span className={styles.accordionMetadata}>{metadata}</span>
            <ChevronDown
              aria-hidden="true"
              className={styles.accordionChevron}
              data-open={isOpen}
              size={17}
            />
          </button>
        </h4>
        {headerAction ? <div className={styles.accordionHeaderAction}>{headerAction}</div> : null}
      </div>
      {isOpen ? (
        <div className={styles.accordionBody} id={panelId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

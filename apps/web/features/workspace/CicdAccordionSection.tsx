"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./delivery-center.module.css";

export type CicdAccordionTone = "current" | "complete" | "success" | "error" | "pending";

export function CicdAccordionSection({
  children,
  defaultOpen = false,
  ensureOpen = false,
  headerAction,
  id,
  isCurrent = false,
  metadata,
  openWhen = false,
  phaseNumber,
  statusLabel,
  statusTone,
  title
}: {
  readonly children: ReactNode;
  readonly defaultOpen?: boolean | undefined;
  readonly ensureOpen?: boolean | undefined;
  readonly headerAction?: ReactNode | undefined;
  readonly id: string;
  readonly isCurrent?: boolean | undefined;
  readonly metadata?: ReactNode | undefined;
  readonly openWhen?: boolean | undefined;
  readonly phaseNumber: string;
  readonly statusLabel: string;
  readonly statusTone: CicdAccordionTone;
  readonly title: string;
}) {
  const generatedId = useId();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const previousEnsureOpenRef = useRef(ensureOpen);
  const previousOpenWhenRef = useRef(openWhen);
  const panelId = `${id}-${generatedId.replaceAll(":", "")}-panel`;

  useEffect(() => {
    if (ensureOpen) {
      setIsOpen(true);
    } else if (previousEnsureOpenRef.current || previousOpenWhenRef.current !== openWhen) {
      setIsOpen(openWhen);
    }
    previousEnsureOpenRef.current = ensureOpen;
    previousOpenWhenRef.current = openWhen;
  }, [ensureOpen, openWhen]);

  return (
    <section
      aria-label={`${phaseNumber} ${title}`}
      className={styles.accordionItem}
      data-current={isCurrent}
      id={id}
    >
      <div className={styles.accordionRow}>
        <h4 className={styles.accordionHeading}>
          <button
            aria-controls={panelId}
            aria-expanded={isOpen}
            aria-label={`${phaseNumber} ${title} · ${statusLabel}`}
            className={styles.accordionToggle}
            onClick={() => setIsOpen((current) => (ensureOpen ? true : !current))}
            type="button"
          >
            <span aria-hidden="true" className={styles.accordionPhase}>
              {phaseNumber}
            </span>
            <span className={styles.accordionTitle}>
              <strong>{title}</strong>
              <span className={styles.accordionStatus} data-tone={statusTone}>
                <i aria-hidden="true" />
                {statusLabel}
              </span>
            </span>
            {metadata ? <span className={styles.accordionMetadata}>{metadata}</span> : <span />}
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

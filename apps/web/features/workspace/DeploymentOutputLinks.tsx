"use client";

import { useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../../lib/clipboard";
import type { SafeDeploymentLink } from "./deployment-output-links";
import styles from "./workspace.module.css";

type ClipboardFeedback = {
  readonly linksKey: string;
  readonly scopeKey: string | null;
  readonly url: string;
  readonly message: string;
};

export function DeploymentOutputLinks({
  links,
  onOpenLiveObservation,
  scopeKey
}: {
  readonly links: readonly SafeDeploymentLink[];
  readonly onOpenLiveObservation?: (() => void) | undefined;
  readonly scopeKey: string | null;
}) {
  const [clipboardFeedback, setClipboardFeedback] =
    useState<ClipboardFeedback | null>(null);
  const linksKey = links.map((link) => `${link.kind}:${link.url}`).join("|");
  const currentClipboardScopeRef = useRef({ linksKey, scopeKey });

  useEffect(() => {
    currentClipboardScopeRef.current = { linksKey, scopeKey };
    setClipboardFeedback(null);
  }, [linksKey, scopeKey]);

  if (links.length === 0) {
    return null;
  }

  async function copyUrl(url: string): Promise<void> {
    try {
      await copyTextToClipboard(url);
      if (!isCurrentClipboardScope()) {
        return;
      }
      setClipboardFeedback({
        linksKey,
        message: "URL을 복사했습니다.",
        scopeKey,
        url
      });
    } catch {
      if (!isCurrentClipboardScope()) {
        return;
      }
      setClipboardFeedback({
        linksKey,
        message: "URL을 복사하지 못했습니다. 수동으로 복사해 주세요.",
        scopeKey,
        url
      });
    }

    function isCurrentClipboardScope(): boolean {
      return currentClipboardScopeRef.current.linksKey === linksKey &&
        currentClipboardScopeRef.current.scopeKey === scopeKey;
    }
  }

  return (
    <div className={styles.deploymentOutputLinks} aria-label="Deployment Output 링크">
      {links.map((link) => (
        <article key={link.kind}>
          <span>{link.label}</span>
          <strong>{link.url}</strong>
          <div>
            <a href={link.url} target="_blank" rel="noreferrer">사이트 열기</a>
            <button type="button" onClick={() => void copyUrl(link.url)}>URL 복사</button>
            {link.kind === "web" && onOpenLiveObservation ? (
              <button type="button" onClick={() => onOpenLiveObservation()}>
                QR 보기 · Live Observation
              </button>
            ) : null}
          </div>
          <span aria-live="polite">
            {clipboardFeedback?.linksKey === linksKey &&
            clipboardFeedback.scopeKey === scopeKey &&
            clipboardFeedback.url === link.url
              ? clipboardFeedback.message
              : ""}
          </span>
        </article>
      ))}
    </div>
  );
}

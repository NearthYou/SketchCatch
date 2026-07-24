"use client";

import { Check, Copy, ExternalLink, QrCode } from "lucide-react";
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
      {links.map((link) => {
        const feedback =
          clipboardFeedback?.linksKey === linksKey &&
          clipboardFeedback.scopeKey === scopeKey &&
          clipboardFeedback.url === link.url
            ? clipboardFeedback.message
            : "";

        return (
          <article data-kind={link.kind} key={link.kind}>
            <div className={styles.deploymentOutputLinkHeading}>
              <div>
                <span>{link.kind === "web" ? "서비스 접속 주소" : "배포 Output"}</span>
                <strong>{link.kind === "web" ? "웹 엔트리 포인트 URL" : link.label}</strong>
              </div>
              {link.kind === "web" ? null : <span>OUTPUT</span>}
            </div>
            <div className={styles.deploymentOutputLinkValue}>
              <span>{link.url}</span>
              <button
                aria-label={`${link.label} URL 복사`}
                onClick={() => void copyUrl(link.url)}
                title="URL 복사"
                type="button"
              >
                {feedback === "URL을 복사했습니다." ? (
                  <Check aria-hidden="true" size={16} />
                ) : (
                  <Copy aria-hidden="true" size={16} />
                )}
              </button>
            </div>
            <div className={styles.deploymentOutputLinkActions}>
              <a href={link.url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" size={15} />
                새 창에서 열기
              </a>
              {link.kind === "web" && onOpenLiveObservation ? (
                <button data-tone="qr" type="button" onClick={() => onOpenLiveObservation()}>
                  <QrCode aria-hidden="true" size={16} />
                  접속 QR · 실시간 관측
                </button>
              ) : null}
            </div>
            <span aria-live="polite" className={styles.deploymentOutputLinkFeedback}>
              {feedback}
            </span>
          </article>
        );
      })}
    </div>
  );
}

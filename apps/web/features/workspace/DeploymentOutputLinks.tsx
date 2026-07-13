"use client";

import { useState } from "react";
import type { SafeDeploymentLink } from "./deployment-output-links";
import styles from "./workspace.module.css";

type ClipboardFeedback = {
  readonly url: string;
  readonly message: string;
};

export function DeploymentOutputLinks({
  links
}: {
  readonly links: readonly SafeDeploymentLink[];
}) {
  const [clipboardFeedback, setClipboardFeedback] =
    useState<ClipboardFeedback | null>(null);

  if (links.length === 0) {
    return null;
  }

  async function copyUrl(url: string): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(url);
      setClipboardFeedback({ url, message: "URL을 복사했습니다." });
    } catch {
      setClipboardFeedback({ url, message: "URL을 복사하지 못했습니다. 수동으로 복사해 주세요." });
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
          </div>
          <span aria-live="polite">
            {clipboardFeedback?.url === link.url ? clipboardFeedback.message : ""}
          </span>
        </article>
      ))}
    </div>
  );
}

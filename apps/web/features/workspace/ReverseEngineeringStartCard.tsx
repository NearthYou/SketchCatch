import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import React from "react";
import type { ReverseEngineeringAwsConnectionRecovery } from "./reverse-engineering-aws-connection-readiness";
import styles from "./reverse-engineering.module.css";

export type ReverseEngineeringStartFailure = {
  readonly action: "open_settings" | "retry";
  readonly description: string;
  readonly title: string;
};

export type ReverseEngineeringStartCardProps = {
  readonly awsConnectionRecovery: ReverseEngineeringAwsConnectionRecovery | null;
  readonly canStartScan: boolean;
  readonly failure: ReverseEngineeringStartFailure | null;
  readonly isLoadingOptions: boolean;
  readonly isScanning: boolean;
  readonly onScanStart: () => void;
};

// gg: 프로젝트를 만들기 전에는 가운데 카드 하나로 AWS 가져오기를 시작하게 합니다.
export function ReverseEngineeringStartCard({
  awsConnectionRecovery,
  canStartScan,
  failure,
  isLoadingOptions,
  isScanning,
  onScanStart
}: ReverseEngineeringStartCardProps) {
  const unavailableRecovery =
    awsConnectionRecovery && awsConnectionRecovery.readiness !== "ready"
      ? awsConnectionRecovery
      : null;
  const status = failure ?? unavailableRecovery;
  const showSettingsAction = failure
    ? failure.action === "open_settings"
    : Boolean(unavailableRecovery);
  const showRetryAction =
    failure?.action === "retry" || (failure?.action === "open_settings" && canStartScan);

  return (
    <section
      aria-busy={isScanning}
      aria-label="Reverse Engineering"
      className={styles.reverseStartCard}
    >
      <p className={styles.eyebrow}>Reverse Engineering</p>
      {status ? (
        <p className={styles.reverseStartCardStatus} role="status">
          <strong>{status.title}</strong>
          <span>{status.description}</span>
        </p>
      ) : null}

      <div className={styles.reverseStartCardActions}>
        {isScanning ? (
          <button className={styles.primaryButton} disabled type="button">
            <LoaderCircle className={styles.spinner} aria-hidden="true" size={16} />
            <span>AWS 구조를 읽는 중…</span>
          </button>
        ) : showSettingsAction ? (
          <>
            <Link
              className={styles.primaryButton}
              href={
                awsConnectionRecovery?.settingsHref ?? "/dashboard/settings?tab=aws&next=reverse"
              }
            >
              환경 설정으로 이동
            </Link>
            {showRetryAction ? (
              <button className={styles.secondaryButton} onClick={onScanStart} type="button">
                다시 시도
              </button>
            ) : null}
          </>
        ) : failure?.action === "retry" ? (
          <button className={styles.primaryButton} onClick={onScanStart} type="button">
            다시 시도
          </button>
        ) : (
          <button
            className={styles.primaryButton}
            disabled={!canStartScan || isLoadingOptions}
            onClick={onScanStart}
            type="button"
          >
            기존 AWS 가져오기
          </button>
        )}
      </div>
    </section>
  );
}

import type { ReverseEngineeringScan } from "@sketchcatch/types";
import styles from "./workspace.module.css";

export type ReverseEngineeringScanHistoryPanelProps = {
  readonly activeScanId: string | null;
  readonly canRescan: boolean;
  readonly isLoading: boolean;
  readonly isStaleResult: boolean;
  readonly onDeleteScan: (scanId: string) => void;
  readonly onOpenScan: (scanId: string) => void;
  readonly onRescan: () => void;
  readonly scans: ReverseEngineeringScan[];
};

// 저장된 Reverse Engineering 스캔 기록을 다시 열 수 있게 보여줍니다.
export function ReverseEngineeringScanHistoryPanel({
  activeScanId,
  canRescan,
  isLoading,
  isStaleResult,
  onDeleteScan,
  onOpenScan,
  onRescan,
  scans
}: ReverseEngineeringScanHistoryPanelProps) {
  return (
    <section className={styles.deploymentSection}>
      <h3>스캔 기록</h3>
      {isStaleResult ? (
        <p className={styles.deploymentNotice}>
          이전 스캔 결과입니다. 지금 AWS 상태와 다를 수 있으니 필요하면 다시 스캔하세요.
        </p>
      ) : null}
      <button
        className={styles.deploymentSecondaryButton}
        disabled={!canRescan}
        onClick={onRescan}
        type="button"
      >
        다시 스캔
      </button>
      {scans.length === 0 ? (
        <p className={styles.deploymentHint}>아직 저장된 스캔 기록이 없습니다.</p>
      ) : (
        <ul className={styles.reverseResultList}>
          {scans.slice(0, 5).map((scan) => (
            <li key={scan.id} className={styles.reverseResultItem}>
              <strong>{formatScanLabel(scan)}</strong>
              <span>
                {scan.status} · {scan.region} · {scan.resourceTypes.join(", ")}
              </span>
              <button
                className={styles.deploymentSecondaryButton}
                disabled={isLoading || activeScanId === scan.id}
                onClick={() => onOpenScan(scan.id)}
                type="button"
              >
                열기
              </button>
              <button
                className={styles.deploymentSecondaryButton}
                disabled={isLoading}
                onClick={() => onDeleteScan(scan.id)}
                type="button"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// 스캔 기록 목록에서 사람이 읽을 수 있는 시간 이름을 만듭니다.
function formatScanLabel(scan: ReverseEngineeringScan): string {
  return scan.completedAt ?? scan.startedAt ?? scan.createdAt;
}

import { RefreshCw } from "lucide-react";
import type { AwsConnection, Project, ResourceType } from "@sketchcatch/types";
import styles from "./workspace.module.css";

type ReverseEngineeringScanCriteriaFormProps = {
  readonly awsConnections: AwsConnection[];
  readonly canStartScan: boolean;
  readonly isLoadingOptions: boolean;
  readonly isScanning: boolean;
  readonly onRefresh: () => void;
  readonly onResourceTypeToggle: (resourceType: ResourceType) => void;
  readonly onScanCancel: () => void;
  readonly onScanStart: () => void;
  readonly onSelectedAwsConnectionChange: (awsConnectionId: string) => void;
  readonly onSelectedProjectChange: (projectId: string) => void;
  readonly projects: Project[];
  readonly resourceTypes: ResourceType[];
  readonly selectedAwsConnectionId: string;
  readonly selectedProjectId: string;
  readonly selectedResourceTypes: ResourceType[];
};

// AWS 스캔을 시작하기 전에 사용자가 고르는 조건만 보여줍니다.
export function ReverseEngineeringScanCriteriaForm({
  awsConnections,
  canStartScan,
  isLoadingOptions,
  isScanning,
  onRefresh,
  onResourceTypeToggle,
  onScanCancel,
  onScanStart,
  onSelectedAwsConnectionChange,
  onSelectedProjectChange,
  projects,
  resourceTypes,
  selectedAwsConnectionId,
  selectedProjectId,
  selectedResourceTypes
}: ReverseEngineeringScanCriteriaFormProps) {
  return (
    <>
      <header className={styles.deploymentHeader}>
        <div className={styles.deploymentHeaderTop}>
          <div>
            <span>Reverse Engineering</span>
            <h2>기존 AWS 읽어오기</h2>
          </div>
          <button
            className={styles.deploymentSecondaryButton}
            disabled={isLoadingOptions}
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span className={styles.deploymentButtonText}>새로고침</span>
          </button>
        </div>
        <p className={styles.deploymentHint}>
          연결된 AWS에서 리소스를 읽고, 보드가 열 수 있는 설계 후보를 만듭니다.
        </p>
      </header>

      <section className={styles.deploymentSection}>
        <h3>스캔 기준</h3>
        <label className={styles.deploymentField}>
          프로젝트
          <select
            disabled={isLoadingOptions}
            onChange={(event) => onSelectedProjectChange(event.currentTarget.value)}
            value={selectedProjectId}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.deploymentField}>
          AWS 연결
          <select
            disabled={isLoadingOptions || awsConnections.length === 0}
            onChange={(event) => onSelectedAwsConnectionChange(event.currentTarget.value)}
            value={selectedAwsConnectionId}
          >
            {awsConnections.length === 0 ? <option value="">검증된 AWS 연결 없음</option> : null}
            {awsConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {formatAwsConnectionLabel(connection)}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.deploymentField}>
          가져올 리소스
          <div className={styles.reverseResourceGrid}>
            {resourceTypes.map((resourceType) => (
              <label key={resourceType} className={styles.reverseResourceToggle}>
                <input
                  checked={selectedResourceTypes.includes(resourceType)}
                  onChange={() => onResourceTypeToggle(resourceType)}
                  type="checkbox"
                />
                <span>{resourceType}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          className={styles.deploymentPrimaryButton}
          disabled={!canStartScan}
          onClick={onScanStart}
          type="button"
        >
          <span className={styles.deploymentButtonText}>{isScanning ? "스캔 중" : "AWS 스캔 시작"}</span>
        </button>
        {isScanning ? (
          <button
            className={styles.deploymentSecondaryButton}
            onClick={onScanCancel}
            type="button"
          >
            취소
          </button>
        ) : null}
      </section>
    </>
  );
}

// AWS 연결 선택 박스에 보여줄 짧은 이름을 만듭니다.
function formatAwsConnectionLabel(connection: AwsConnection): string {
  const accountLabel = connection.accountId ?? "계정 미확인";
  return `${accountLabel} · ${connection.region}`;
}

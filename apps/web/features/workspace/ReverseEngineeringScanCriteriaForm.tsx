import { RefreshCw } from "lucide-react";
import type { AwsConnection, Project, ReverseEngineeringResourceSelection } from "@sketchcatch/types";
import styles from "./workspace.module.css";

type ReverseEngineeringScanCriteriaFormProps = {
  readonly awsConnections: AwsConnection[];
  readonly canStartScan: boolean;
  readonly createProjectOnApply?: boolean | undefined;
  readonly isLoadingOptions: boolean;
  readonly isScanning: boolean;
  readonly onRefresh: () => void;
  readonly onResourceTypeToggle: (resourceType: ReverseEngineeringResourceSelection) => void;
  readonly onScanCancel: () => void;
  readonly onScanStart: () => void;
  readonly onSelectedAwsConnectionChange: (awsConnectionId: string) => void;
  readonly onSelectedProjectChange: (projectId: string) => void;
  readonly projects: Project[];
  readonly resourceTypes: ReverseEngineeringResourceSelection[];
  readonly selectedAwsConnectionId: string;
  readonly selectedProjectId: string;
  readonly selectedResourceTypes: ReverseEngineeringResourceSelection[];
};

// Reverse Engineering 첫 화면에서 기본 전체 가져오기 흐름을 먼저 보여줍니다.
export function ReverseEngineeringScanCriteriaForm({
  awsConnections,
  canStartScan,
  createProjectOnApply = false,
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
  const selectedAwsConnectionRegion = getSelectedAwsConnectionRegion(
    awsConnections,
    selectedAwsConnectionId
  );

  return (
    <>
      <header className={styles.deploymentHeader}>
        <div className={styles.deploymentHeaderTop}>
          <div>
            <span>Reverse Engineering</span>
            <h2>기존 AWS 가져오기</h2>
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
          검증된 AWS 연결을 기준으로 전체 리소스를 읽고, 보드에 적용하기 전 미리보기를 만듭니다.
        </p>
      </header>

      <section className={styles.deploymentSection}>
        <h3>전체 스캔</h3>
        <p className={styles.deploymentHint}>
          {createProjectOnApply
            ? "프로젝트는 후보를 적용할 때 생성됩니다. 지금은 AWS를 먼저 읽고 보드 후보만 보여줍니다."
            : "기본값은 현재 프로젝트, 선택된 AWS 연결, 전체 리소스입니다. 스캔 후 바로 반영하지 않고 먼저 확인 화면을 보여줍니다."}
        </p>

        <button
          className={styles.deploymentPrimaryButton}
          disabled={!canStartScan}
          onClick={onScanStart}
          type="button"
        >
          <span className={styles.deploymentButtonText}>{isScanning ? "가져오는 중" : "기존 AWS 가져오기"}</span>
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

        <details className={styles.reverseAdvancedSettings}>
          <summary className={styles.reverseAdvancedSummary}>고급 설정</summary>

          {createProjectOnApply ? (
            <p className={styles.deploymentHint}>프로젝트는 후보를 적용할 때 생성됩니다.</p>
          ) : (
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
          )}

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

          <p className={styles.deploymentHint}>현재 리전: {selectedAwsConnectionRegion}</p>

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
                  <span>{formatResourceSelectionLabel(resourceType)}</span>
                </label>
              ))}
            </div>
          </div>
        </details>
      </section>
    </>
  );
}

// 선택된 AWS 연결에서 실제 스캔에 쓰일 리전을 꺼냅니다.
function getSelectedAwsConnectionRegion(
  awsConnections: AwsConnection[],
  selectedAwsConnectionId: string
): string {
  return awsConnections.find((connection) => connection.id === selectedAwsConnectionId)?.region ?? "리전 미선택";
}

// `ALL`은 사용자가 이해하는 화면 라벨로 보여주고, 실제 리소스 타입 이름은 그대로 둡니다.
function formatResourceSelectionLabel(resourceType: ReverseEngineeringResourceSelection): string {
  return resourceType === "ALL" ? "전체" : resourceType;
}

// AWS 연결 선택 박스에 보여줄 짧은 이름을 만듭니다.
function formatAwsConnectionLabel(connection: AwsConnection): string {
  const accountLabel = connection.accountId ? maskAwsAccountId(connection.accountId) : "계정 미확인";
  return `${accountLabel} · ${connection.region}`;
}

// Reverse Engineering 화면에 계정 ID 전체가 바로 보이지 않게 가립니다.
function maskAwsAccountId(accountId: string): string {
  return accountId.replace(/\b(\d{4})\d{8}\b/g, "$1********");
}

import { LoaderCircle, RefreshCw } from "lucide-react";
import React from "react";
import type { AwsConnection, Project, ReverseEngineeringResourceSelection } from "@sketchcatch/types";
import {
  formatReverseEngineeringResourceSelectionLabel,
  isReverseEngineeringResourceSelectionChecked
} from "./reverse-engineering-resource-types";
import {
  formatReverseEngineeringAwsConnectionLabel,
  type ReverseEngineeringAwsConnectionRecovery
} from "./reverse-engineering-aws-connection-readiness";
import styles from "./reverse-engineering.module.css";

type ReverseEngineeringScanCriteriaFormProps = {
  readonly awsConnectionRecovery: ReverseEngineeringAwsConnectionRecovery;
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
  awsConnectionRecovery,
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
    <React.Fragment>
      <header className={styles.panelHeader}>
        <div className={styles.panelHeaderTop}>
          <div className={styles.panelHeaderTitle}>
            <span className={styles.eyebrow}>Reverse Engineering</span>
            <h2>기존 AWS 가져오기</h2>
          </div>
          <button
            aria-label="AWS 연결 새로고침"
            className={styles.iconButton}
            disabled={isLoadingOptions}
            onClick={onRefresh}
            title="AWS 연결 새로고침"
            type="button"
          >
            <RefreshCw size={14} aria-hidden="true" />
          </button>
        </div>
        <p>
          검증된 AWS Role로 기존 Resource와 관계를 읽습니다.
        </p>
      </header>

      <section className={styles.section}>
        <h3>전체 스캔</h3>
        <p className={styles.sectionDescription}>
          {createProjectOnApply
            ? "프로젝트는 후보를 적용할 때 생성됩니다."
            : "결과를 바로 반영하지 않고 먼저 미리보기로 보여줍니다."}
        </p>
        <p className={styles.scopeHelp}>
          전체: 현재 지원 Resource와 확인 전용 AWS Resource를 함께 읽습니다.<br />
          개별 선택: 선택한 정식 지원 Resource만 읽습니다.
        </p>

        <button
          className={styles.primaryButton}
          disabled={!canStartScan || !awsConnectionRecovery.canStartScan}
          onClick={onScanStart}
          type="button"
        >
          {isScanning ? <LoaderCircle className={styles.spinner} aria-hidden="true" size={16} /> : null}
          <span>{isScanning ? "AWS를 읽는 중" : "기존 AWS 가져오기"}</span>
        </button>
        {awsConnectionRecovery.readiness !== "ready" ? (
          <div className={styles.connectionRecovery} role="status">
            <strong>{awsConnectionRecovery.title}</strong>
            <p>{awsConnectionRecovery.description}</p>
            <a href={awsConnectionRecovery.settingsHref}>{awsConnectionRecovery.actionLabel}</a>
          </div>
        ) : null}
        {isScanning && !createProjectOnApply ? (
          <button
            className={styles.secondaryButton}
            onClick={onScanCancel}
            type="button"
          >
            취소
          </button>
        ) : null}
        {isScanning && createProjectOnApply ? (
          <p className={styles.loadingRow} role="status">
            AWS 응답을 기다리고 있습니다. 이 단계에서는 프로젝트가 만들어지지 않습니다.
          </p>
        ) : null}
      </section>

      <details className={styles.advanced}>
        <summary className={styles.advancedSummary}>고급 설정</summary>
        <div className={styles.advancedBody}>
          {createProjectOnApply ? null : (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>프로젝트</span>
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

          <label className={styles.field}>
            <span className={styles.fieldLabel}>AWS 연결</span>
            <select
              disabled={isLoadingOptions || awsConnections.length === 0}
              onChange={(event) => onSelectedAwsConnectionChange(event.currentTarget.value)}
              value={selectedAwsConnectionId}
            >
              {awsConnections.length === 0 ? <option value="">AWS 연결 없음</option> : null}
              {awsConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {formatReverseEngineeringAwsConnectionLabel(connection)}
                </option>
              ))}
            </select>
          </label>

          <p className={styles.hint}>현재 리전: {selectedAwsConnectionRegion}</p>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>가져올 Resource</span>
            <div className={styles.resourceGrid}>
              {resourceTypes.map((resourceType) => (
                <label key={resourceType} className={styles.resourceToggle}>
                  <input
                    checked={isReverseEngineeringResourceSelectionChecked(selectedResourceTypes, resourceType)}
                    onChange={() => onResourceTypeToggle(resourceType)}
                    type="checkbox"
                  />
                  <span>{formatResourceSelectionLabel(resourceType)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </details>
    </React.Fragment>
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
  return formatReverseEngineeringResourceSelectionLabel(resourceType);
}

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import React from "react";
import type {
  AwsConnection,
  Project,
  ReverseEngineeringResourceSelection
} from "@sketchcatch/types";
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
  onResourceTypeToggle,
  onScanCancel,
  onScanStart,
  onSelectedAwsConnectionChange,
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
  const showScanAction = !createProjectOnApply;

  return (
    <React.Fragment>
      {showScanAction ? (
        <section className={styles.section}>
          <h3>전체 스캔</h3>
          <p className={styles.sectionDescription}>
            결과를 바로 반영하지 않고 먼저 미리보기로 보여줍니다.
          </p>
          <p className={styles.scopeHelp}>
            전체: AWS에서 찾은 리소스를 함께 읽습니다.
            <br />
            개별 선택: 고른 리소스만 읽습니다.
          </p>

          <button
            className={styles.primaryButton}
            disabled={!canStartScan || !awsConnectionRecovery.canStartScan}
            onClick={onScanStart}
            type="button"
          >
            {isScanning ? (
              <LoaderCircle className={styles.spinner} aria-hidden="true" size={16} />
            ) : null}
            <span>{isScanning ? "AWS를 읽는 중" : "기존 AWS 가져오기"}</span>
          </button>
          {awsConnectionRecovery.readiness !== "ready" ? (
            <div className={styles.connectionRecovery} role="status">
              <strong>{awsConnectionRecovery.title}</strong>
              <p>{awsConnectionRecovery.description}</p>
              <Link href={awsConnectionRecovery.settingsHref}>
                {awsConnectionRecovery.actionLabel}
              </Link>
            </div>
          ) : null}
          {isScanning ? (
            <button className={styles.secondaryButton} onClick={onScanCancel} type="button">
              취소
            </button>
          ) : null}
        </section>
      ) : null}

      <details className={styles.advanced}>
        <summary className={styles.advancedSummary}>고급 설정</summary>
        <div className={styles.advancedBody}>
          {createProjectOnApply ? null : (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>프로젝트</span>
              <select disabled value={selectedProjectId}>
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
                    checked={isReverseEngineeringResourceSelectionChecked(
                      selectedResourceTypes,
                      resourceType
                    )}
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
  return (
    awsConnections.find((connection) => connection.id === selectedAwsConnectionId)?.region ??
    "리전 미선택"
  );
}

// `ALL`은 사용자가 이해하는 화면 라벨로 보여주고, 실제 리소스 타입 이름은 그대로 둡니다.
function formatResourceSelectionLabel(resourceType: ReverseEngineeringResourceSelection): string {
  return formatReverseEngineeringResourceSelectionLabel(resourceType);
}

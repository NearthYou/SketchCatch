import type {
  DiscoveredResource,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResponse,
  ReverseEngineeringScanError
} from "@sketchcatch/types";
import type { ReactNode } from "react";
import type { ReverseEngineeringBoardComparison } from "./reverse-engineering-board-application";
import type { ReverseEngineeringBoardCandidate } from "./reverse-engineering-board-candidates";
import { ReverseEngineeringFindingsPanel } from "./ReverseEngineeringFindingsPanel";
import { ReverseEngineeringResourceParametersPanel } from "./ReverseEngineeringResourceParametersPanel";
import styles from "./reverse-engineering.module.css";

export type ReverseEngineeringApplyState = "idle" | "saving" | "saved" | "error";

export type ReverseEngineeringResultPanelProps = {
  readonly applyMessage: string | null;
  readonly applyState: ReverseEngineeringApplyState;
  readonly boardCandidates: readonly ReverseEngineeringBoardCandidate[];
  readonly comparison: ReverseEngineeringBoardComparison;
  readonly createProjectOnApply: boolean;
  readonly hasCurrentBoardResources: boolean;
  readonly logs: ReverseEngineeringScanLogLine[];
  readonly onAppendToCurrentBoard: () => void;
  readonly onOpenAsNewBoard: () => void;
  readonly onRetryScan: () => void;
  readonly response: ReverseEngineeringScanResponse;
  readonly selectedCandidateId: string;
};

// 스캔 결과와 사용자가 누를 적용 버튼을 한 화면에 모아 보여줍니다.
export function ReverseEngineeringResultPanel({
  applyMessage,
  applyState,
  boardCandidates,
  comparison,
  createProjectOnApply,
  hasCurrentBoardResources,
  logs,
  onAppendToCurrentBoard,
  onOpenAsNewBoard,
  onRetryScan,
  response,
  selectedCandidateId
}: ReverseEngineeringResultPanelProps) {
  const result = response.result;

  if (!result) {
    return null;
  }

  const isApplying = applyState === "saving";
  const unsupportedResources = result.discoveredResources.filter(
    (resource) => resource.resourceType === "UNKNOWN"
  );
  const selectedCandidate = getSelectedBoardCandidate({ candidates: boardCandidates, selectedCandidateId });
  const primaryApplyLabel = getPrimaryApplyLabel({ createProjectOnApply, hasCurrentBoardResources });

  return (
    <>
      <section className={styles.section}>
        <h3>스캔 요약</h3>
        <div className={styles.stats}>
          <span>
            찾은 리소스
            <strong>{result.discoveredResources.length}</strong>
          </span>
          <span>
            못 읽은 서비스
            <strong>{result.scanErrors.length}</strong>
          </span>
          <span>
            적용할 구조
            <strong>{selectedCandidate?.title ?? "기본 후보"}</strong>
          </span>
        </div>
        <p className={styles.hint}>
          현재 보이는 구조로 프로젝트를 만듭니다.
        </p>
        {comparison.manualReviews.length > 0 ? (
          <p className={styles.warning}>
            AWS 원본 ID가 없거나 Terraform 이름만 겹치는 Resource는 자동으로 합치지 않습니다.
          </p>
        ) : null}
        <div className={styles.buttonRow}>
          <button
            className={styles.primaryButton}
            disabled={isApplying}
            onClick={onOpenAsNewBoard}
            type="button"
          >
            <span>{primaryApplyLabel}</span>
          </button>
          {hasCurrentBoardResources ? (
            <button
              className={styles.secondaryButton}
              disabled={isApplying || comparison.additions.length === 0}
              onClick={onAppendToCurrentBoard}
              type="button"
            >
              현재 보드에 추가
            </button>
          ) : null}
        </div>
        {applyMessage ? (
          <p className={applyState === "error" ? styles.error : styles.success}>
            {applyMessage}
          </p>
        ) : null}
      </section>

      <ReverseEngineeringDetailGroup title="부분 실패">
        <ReverseEngineeringScanCoveragePanel
          onRetryScan={onRetryScan}
          scanErrors={result.scanErrors}
          unsupportedResourceCount={unsupportedResources.length}
        />
      </ReverseEngineeringDetailGroup>

      <ReverseEngineeringDetailGroup title="발견한 Resource">
        <DiscoveredResourcePreview resources={result.discoveredResources} />
        <p className={styles.hint}>
          리소스를 고르면 오른쪽 상세 패널에서 원본 값을 확인할 수 있습니다.
        </p>
      </ReverseEngineeringDetailGroup>

      <ReverseEngineeringDetailGroup title="리소스 파라미터">
        <ReverseEngineeringResourceParametersPanel discoveredResources={result.discoveredResources} />
      </ReverseEngineeringDetailGroup>

      <ReverseEngineeringDetailGroup title="위험/비용 finding">
        <ReverseEngineeringFindingsPanel
          analysisExclusions={result.analysisExclusions}
          findings={result.findings}
        />
      </ReverseEngineeringDetailGroup>

      <ReverseEngineeringDetailGroup title="미지원 Resource">
        <UnsupportedResourceList resources={unsupportedResources} />
      </ReverseEngineeringDetailGroup>

      <ReverseEngineeringDetailGroup title="스캔 로그">
        <ReverseEngineeringLogList logs={logs} />
      </ReverseEngineeringDetailGroup>
    </>
  );
}

// 왼쪽에서 고른 후보를 찾고, 아직 선택이 없으면 첫 후보를 기본값으로 사용합니다.
function getSelectedBoardCandidate({
  candidates,
  selectedCandidateId
}: {
  readonly candidates: readonly ReverseEngineeringBoardCandidate[];
  readonly selectedCandidateId: string;
}): ReverseEngineeringBoardCandidate | null {
  return candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0] ?? null;
}

// 새 프로젝트 시작인지 기존 보드 작업인지에 맞춰 적용 버튼 문구를 정합니다.
function getPrimaryApplyLabel({
  createProjectOnApply,
  hasCurrentBoardResources
}: {
  readonly createProjectOnApply: boolean;
  readonly hasCurrentBoardResources: boolean;
}): string {
  if (createProjectOnApply) {
    return "프로젝트로 만들기";
  }

  return hasCurrentBoardResources ? "새 보드로 열기" : "보드에 적용";
}

// 긴 보조 정보는 기본 화면을 가리지 않도록 접을 수 있는 한 묶음으로 보여줍니다.
function ReverseEngineeringDetailGroup({
  children,
  title
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <details className={styles.detail}>
      <summary className={styles.detailSummary}>{title}</summary>
      <div className={styles.detailBody}>{children}</div>
    </details>
  );
}

// 사용자가 적용하기 전에 이번 스캔이 전체 결과인지 부분 결과인지 먼저 알려줍니다.
function ReverseEngineeringScanCoveragePanel({
  onRetryScan,
  scanErrors,
  unsupportedResourceCount
}: {
  readonly onRetryScan: () => void;
  readonly scanErrors: ReverseEngineeringScanError[];
  readonly unsupportedResourceCount: number;
}) {
  const notice = getScanCoverageNotice(scanErrors);
  const hasRetryableScanError = scanErrors.some((scanError) => scanError.retryable);

  return (
    <div>
      <div className={styles.stats}>
        <span>
          못 읽은 서비스
          <strong>{scanErrors.length}</strong>
        </span>
        <span>
          확인 필요
          <strong>{unsupportedResourceCount}</strong>
        </span>
      </div>
      <p className={scanErrors.length > 0 ? styles.warning : styles.hint}>
        {notice}
      </p>
      {scanErrors.length > 0 ? (
        <details className={styles.detail}>
          <summary className={styles.detailSummary}>못 읽은 서비스 자세히 보기</summary>
          <div className={styles.detailBody}>
            <ul className={styles.resultList}>
              {scanErrors.map((scanError, index) => (
                <li key={`${scanError.id}-${index}`} className={styles.resultItem}>
                  <strong>{scanError.resourceType}</strong>
                  <span>
                    stage: {scanError.stage} · reason: {scanError.reason} · retryable:{" "}
                    {formatRetryableStatus(scanError.retryable)}
                  </span>
                  <span>{scanError.message}</span>
                </li>
              ))}
            </ul>
            {hasRetryableScanError ? (
              <button className={styles.secondaryButton} onClick={onRetryScan} type="button">
                다시 스캔
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

// Resource Explorer 실패처럼 전체 스캔 범위에 영향을 주는 상태를 쉬운 말로 바꿉니다.
function getScanCoverageNotice(scanErrors: ReverseEngineeringScanError[]): string {
  if (scanErrors.some((scanError) => scanError.id === "scan-error-resource-explorer")) {
    return "Resource Explorer를 읽지 못했습니다. 가져온 결과가 전체 AWS 상태가 아닐 수 있습니다.";
  }

  if (scanErrors.length > 0) {
    return "일부 AWS 서비스를 읽지 못했습니다. 가져온 결과가 전체 AWS 상태가 아닐 수 있습니다.";
  }

  return "현재 권한으로 읽을 수 있는 범위에서는 부분 실패 없이 스캔했습니다.";
}

// 아직 정식 변환하지 못한 AWS 리소스를 숨기지 않고 별도 목록으로 보여줍니다.
function UnsupportedResourceList({ resources }: { readonly resources: DiscoveredResource[] }) {
  if (resources.length === 0) {
    return <p className={styles.hint}>미지원 Resource가 없습니다.</p>;
  }

  return (
    <>
      <p className={styles.hint}>
        AWS에서 발견했지만 아직 SketchCatch 정식 ResourceType으로 매핑하지 못한 항목입니다.
      </p>
      <ul className={styles.resultList}>
        {resources.map((resource) => (
          <li key={resource.id} className={styles.resultItem}>
            <strong>{resource.displayName}</strong>
            <span>{resource.providerResourceType}</span>
            <span>
              {resource.providerResourceId} · {resource.region}
            </span>
            <span>Terraform 생성, 배포, 확정 비용/보안 판단에서는 제외됩니다.</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// 이번 스캔에서 발견한 리소스의 이름과 AWS 원본 식별자를 간단히 보여줍니다.
function DiscoveredResourcePreview({ resources }: { readonly resources: readonly DiscoveredResource[] }) {
  if (resources.length === 0) {
    return <p className={styles.hint}>아직 발견한 Resource가 없습니다.</p>;
  }

  return (
    <ul className={styles.resultList}>
      {resources.slice(0, 8).map((resource) => (
        <li key={resource.id} className={styles.resultItem}>
          <strong>{resource.displayName}</strong>
          <span>
            {resource.resourceType} · {resource.providerResourceId}
          </span>
        </li>
      ))}
    </ul>
  );
}

// 스캔 진행 중 서버가 남긴 단계별 로그를 시간 순서대로 보여줍니다.
function ReverseEngineeringLogList({ logs }: { readonly logs: readonly ReverseEngineeringScanLogLine[] }) {
  if (logs.length === 0) {
    return <p className={styles.hint}>표시할 로그가 없습니다.</p>;
  }

  return (
    <ul className={styles.logList}>
      {logs.map((log) => (
        <li className={styles.logItem} key={log.id} data-level={log.level}>
          <strong>{log.stage}</strong>
          <span>{log.message}</span>
        </li>
      ))}
    </ul>
  );
}

// 서버의 재시도 가능 여부를 사용자가 바로 이해할 수 있는 말로 바꿉니다.
function formatRetryableStatus(retryable: boolean): string {
  return retryable ? "다시 시도 가능" : "다시 시도 어려움";
}

import type {
  BoardAutoOrganizeCandidate,
  DiscoveredResource,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResponse,
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage
} from "@sketchcatch/types";
import type { ReactNode } from "react";
import type {
  ReverseEngineeringBoardApplicationMode,
  ReverseEngineeringBoardComparison,
  ReverseEngineeringPlacement
} from "./reverse-engineering-board-application";
import type { ReverseEngineeringBoardCandidate } from "./reverse-engineering-board-candidates";
import { ReverseEngineeringFindingsPanel } from "./ReverseEngineeringFindingsPanel";
import {
  presentReverseEngineeringResource,
  presentReverseEngineeringScanErrors,
  summarizeReverseEngineeringScan
} from "./reverse-engineering-presentation";
import styles from "./reverse-engineering.module.css";

export type ReverseEngineeringApplyState = "idle" | "saving" | "saved" | "partial" | "error";
export type ReverseEngineeringResultPanelProps = {
  readonly applyMessage: string | null;
  readonly applicationMode: ReverseEngineeringBoardApplicationMode;
  readonly applyState: ReverseEngineeringApplyState;
  readonly boardCandidates: readonly ReverseEngineeringBoardCandidate[];
  readonly comparison: ReverseEngineeringBoardComparison;
  readonly createProjectOnApply: boolean;
  readonly hasCurrentBoardResources: boolean;
  readonly logs: ReverseEngineeringScanLogLine[];
  readonly onAppendToCurrentBoard: () => void;
  readonly onApplicationModeChange: (mode: ReverseEngineeringBoardApplicationMode) => void;
  readonly onCompilePlacement: () => void;
  readonly onKeepOriginalPlacement: () => void;
  readonly onReplaceCurrentBoard: () => void;
  readonly onRetryScan: () => void;
  readonly onSelectOrganizationCandidate: (candidateId: string) => void;
  readonly organizationCandidates: readonly BoardAutoOrganizeCandidate[];
  readonly permissionRecoveryHref: string;
  readonly response: ReverseEngineeringScanResponse;
  readonly selectedCandidateId: string;
  readonly selectedOrganizationCandidateId: string | null;
  readonly placement: ReverseEngineeringPlacement;
};

// 스캔 결과와 사용자가 누를 적용 버튼을 한 화면에 모아 보여줍니다.
export function ReverseEngineeringResultPanel({
  applyMessage,
  applicationMode,
  applyState,
  comparison,
  createProjectOnApply,
  hasCurrentBoardResources,
  onAppendToCurrentBoard,
  onApplicationModeChange,
  onCompilePlacement,
  onKeepOriginalPlacement,
  onReplaceCurrentBoard,
  onRetryScan,
  onSelectOrganizationCandidate,
  organizationCandidates,
  permissionRecoveryHref,
  placement,
  response,
  selectedOrganizationCandidateId
}: ReverseEngineeringResultPanelProps) {
  const result = response.result;

  if (!result) {
    return null;
  }

  const isApplying = applyState === "saving";
  const summary = summarizeReverseEngineeringScan(result);
  const hasApplicableResources = summary.boardCount > 0;
  const hasPartialFailure = result.coverage
    ? result.coverage.status === "partial"
    : result.scanErrors.length > 0;
  const hasPermissionFailure = result.coverage
    ? result.coverage.unavailableServices.some((service) => service.remedy === "open_settings")
    : result.scanErrors.some((scanError) => scanError.reason === "permission_denied");
  const unsupportedResources = result.discoveredResources.filter(
    (resource) => presentReverseEngineeringResource(resource).displayState === "review_only"
  );
  const primaryApplyLabel = getPrimaryApplyLabel({
    createProjectOnApply,
    hasCurrentBoardResources,
    hasPartialFailure
  });

  return (
    <>
      <section className={styles.section}>
        <h3>스캔 요약</h3>
        <div className={styles.summaryStats}>
          <span>
            찾은 Resource
            <strong>{summary.discoveredCount}</strong>
          </span>
          <span>
            보드에 표시
            <strong>{summary.boardCount}</strong>
          </span>
          <span>
            확인 필요
            <strong>{summary.reviewOnlyCount}</strong>
          </span>
          <span>
            못 읽은 서비스
            <strong>{summary.unreadableServiceCount}</strong>
          </span>
        </div>
        <p className={styles.hint}>AWS에서 읽은 범위와 확인이 필요한 Resource를 먼저 검토하세요.</p>
        {comparison.manualReviews.length > 0 ? (
          <p className={styles.warning}>
            AWS 원본 ID가 없거나 Terraform 이름만 겹치는 Resource는 자동으로 합치지 않습니다.
          </p>
        ) : null}
        {summary.reviewOnlyCount > 0 ? (
          <p className={styles.warning}>
            일부 Resource는 AWS에서 찾았지만 아직 자동 분석과 Terraform 처리 범위가 아닙니다.
            <br />
            보드 또는 확인 필요 목록에서 위치와 원본 정보를 확인할 수 있습니다.
          </p>
        ) : null}
        {hasPartialFailure ? (
          <div className={styles.warning} role="alert">
            <strong>일부 항목을 가져오지 못했어요</strong>
            <p>가져온 항목만 사용해 계속 진행할 수 있어요.</p>
            {hasPermissionFailure ? (
              <a className={styles.secondaryButton} href={permissionRecoveryHref}>
                환경설정에서 권한 보완
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={styles.placementDecision} aria-label="배치 선택">
        <div
          aria-atomic="true"
          aria-live="polite"
          className={styles.placementDecisionHeader}
        >
          <span className={styles.placementBadge}>
            {placement === "compiled" ? "정리안" : "원본"}
          </span>
          <h3>
            {placement === "compiled" ? "자동 정리 미리보기" : "AWS에서 가져온 원본"}
          </h3>
        </div>
        <p className={styles.placementDescription}>
          {placement === "compiled"
            ? "Resource와 관계와 설정은 그대로 두고, 위치와 연결선만 정리한 모습입니다."
            : "가져온 Resource와 관계와 설정을 바꾸지 않은 상태를 먼저 보여드립니다."}
        </p>
        {hasCurrentBoardResources ? (
          <div className={styles.placementActions} role="group" aria-label="적용 방식 미리보기">
            <button
              aria-pressed={applicationMode === "replace"}
              className={styles.secondaryButton}
              onClick={() => onApplicationModeChange("replace")}
              type="button"
            >
              현재 보드 교체 미리보기
            </button>
            <button
              aria-pressed={applicationMode === "append"}
              className={styles.secondaryButton}
              onClick={() => onApplicationModeChange("append")}
              type="button"
            >
              현재 보드 추가 미리보기
            </button>
          </div>
        ) : null}
        <div className={styles.placementActions} role="group" aria-label="배치 미리보기 선택">
          <button
            aria-pressed={placement === "compiled"}
            className={styles.primaryButton}
            onClick={onCompilePlacement}
            type="button"
          >
            자동 정리 해보기
          </button>
          <button
            aria-pressed={placement === "original"}
            className={styles.secondaryButton}
            onClick={onKeepOriginalPlacement}
            type="button"
          >
            원본 보기
          </button>
        </div>
        {organizationCandidates.length > 0 ? (
          <div
            aria-label="Board 정리안 선택"
            className={styles.organizationCandidates}
            role="list"
          >
            {organizationCandidates.map((candidate, index) => (
              <button
                aria-pressed={candidate.id === selectedOrganizationCandidateId}
                key={candidate.id}
                onClick={() => onSelectOrganizationCandidate(candidate.id)}
                role="listitem"
                type="button"
              >
                <strong>정리안 {index + 1}</strong>
                <span>
                  {candidate.explanations[0] ??
                    "Resource 위치와 연결선을 보기 좋게 정리합니다."}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <p className={styles.placementSaveBoundary}>
          원본과 정리 결과를 전환해도 저장되지 않습니다. 마지막 적용 버튼을 눌러야 보드에
          반영됩니다.
        </p>
      </section>

      <section className={styles.section} aria-label="선택한 배치 적용">
        <h3>선택한 배치 적용</h3>
        <p className={styles.sectionDescription}>
          {placement === "compiled" ? "선택한 정리안" : "가져온 원본"}을 확인한 뒤 원하는 적용
          방식을 선택하세요.
        </p>
        <div className={styles.buttonRow}>
          <button
            className={styles.primaryButton}
            disabled={
              isApplying ||
              !hasApplicableResources ||
              (hasCurrentBoardResources && applicationMode !== "replace")
            }
            onClick={onReplaceCurrentBoard}
            type="button"
          >
            <span>{primaryApplyLabel}</span>
          </button>
          {hasCurrentBoardResources ? (
            <button
              className={styles.secondaryButton}
              disabled={
                isApplying ||
                !hasApplicableResources ||
                comparison.additions.length === 0 ||
                applicationMode !== "append"
              }
              onClick={onAppendToCurrentBoard}
              type="button"
            >
              {hasPartialFailure ? "가져온 항목만 현재 보드에 추가" : "현재 보드에 추가"}
            </button>
          ) : null}
        </div>
        {!hasApplicableResources ? (
          <p className={styles.warning} role="status">
            보드에 표시할 항목이 없어요. 다시 스캔해 주세요.
          </p>
        ) : null}
        {applyMessage ? (
          <p
            className={
              applyState === "error"
                ? styles.error
                : applyState === "partial"
                  ? styles.warning
                  : styles.success
            }
            role={applyState === "error" ? "alert" : "status"}
          >
            {applyMessage}
          </p>
        ) : null}
      </section>

      <ReverseEngineeringDetailGroup title="부분 실패">
        <ReverseEngineeringScanCoveragePanel
          coverage={result.coverage}
          onRetryScan={onRetryScan}
          scanErrors={result.scanErrors}
        />
      </ReverseEngineeringDetailGroup>

      <ReverseEngineeringDetailGroup title="발견한 Resource">
        <DiscoveredResourcePreview resources={result.discoveredResources} />
        <p className={styles.hint}>
          리소스를 고르면 오른쪽 상세 패널에서 원본 값을 확인할 수 있습니다.
        </p>
      </ReverseEngineeringDetailGroup>

      <ReverseEngineeringDetailGroup title="위험/비용 finding">
        <ReverseEngineeringFindingsPanel
          analysisExclusions={result.analysisExclusions}
          findings={result.findings}
          resources={result.discoveredResources}
        />
      </ReverseEngineeringDetailGroup>

      <ReverseEngineeringDetailGroup title="미지원 Resource">
        <UnsupportedResourceList resources={unsupportedResources} />
      </ReverseEngineeringDetailGroup>

    </>
  );
}

// 새 프로젝트 시작인지 기존 보드 작업인지에 맞춰 적용 버튼 문구를 정합니다.
function getPrimaryApplyLabel({
  createProjectOnApply,
  hasCurrentBoardResources,
  hasPartialFailure
}: {
  readonly createProjectOnApply: boolean;
  readonly hasCurrentBoardResources: boolean;
  readonly hasPartialFailure: boolean;
}): string {
  if (hasPartialFailure) {
    if (createProjectOnApply) {
      return "가져온 항목으로 프로젝트 만들기";
    }

    return hasCurrentBoardResources
      ? "현재 보드를 가져온 항목으로 바꾸기"
      : "가져온 항목만 보드에 적용";
  }

  if (createProjectOnApply) {
    return "프로젝트로 만들기";
  }

  return hasCurrentBoardResources
    ? "현재 보드를 가져온 항목으로 바꾸기"
    : "보드에 적용";
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
  coverage,
  onRetryScan,
  scanErrors
}: {
  readonly coverage?: ReverseEngineeringServiceCoverage | undefined;
  readonly onRetryScan: () => void;
  readonly scanErrors: ReverseEngineeringScanError[];
}) {
  const notice = getScanCoverageNotice(coverage, scanErrors);
  const hasPartialFailure = coverage ? coverage.status === "partial" : scanErrors.length > 0;
  const hasRetryableScanError = coverage
    ? coverage.unavailableServices.some((service) => service.remedy === "retry")
    : scanErrors.some((scanError) => scanError.retryable);
  const presentations = coverage
    ? coverage.unavailableServices.map((service) => ({
        key: service.serviceKey,
        serviceName: service.displayName,
        remedy: getCoverageRemedy(service.reason)
      }))
    : presentReverseEngineeringScanErrors(scanErrors);

  return (
    <div>
      <p className={hasPartialFailure ? styles.warning : styles.hint}>{notice}</p>
      {hasPartialFailure ? (
        <details className={styles.detail}>
          <summary className={styles.detailSummary}>못 읽은 서비스 자세히 보기</summary>
          <div className={styles.detailBody}>
            <ul className={styles.resultList}>
              {presentations.map((presentation) => (
                <li key={presentation.key} className={styles.resultItem}>
                  <strong>{presentation.serviceName}</strong>
                  <span className={styles.errorBadge}>읽기 실패</span>
                  <span>{presentation.remedy}</span>
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
function getScanCoverageNotice(
  coverage: ReverseEngineeringServiceCoverage | undefined,
  scanErrors: ReverseEngineeringScanError[]
): string {
  if (
    coverage?.unavailableServices.some((service) => service.serviceKey === "resource-explorer") ||
    scanErrors.some((scanError) => scanError.id === "scan-error-resource-explorer")
  ) {
    return "Resource Explorer를 읽지 못했습니다. 가져온 결과가 전체 AWS 상태가 아닐 수 있습니다.";
  }

  if (coverage?.status === "partial" || scanErrors.length > 0) {
    return "일부 AWS 서비스를 읽지 못했습니다. 가져온 결과가 전체 AWS 상태가 아닐 수 있습니다.";
  }

  return "현재 권한으로 읽을 수 있는 범위에서는 부분 실패 없이 스캔했습니다.";
}

// gg: 공개 coverage의 세 가지 원인만 사용자가 바로 할 수 있는 짧은 문장으로 바꿉니다.
function getCoverageRemedy(
  reason: ReverseEngineeringServiceCoverage["unavailableServices"][number]["reason"]
): string {
  if (reason === "permission_required") {
    return "환경설정에서 읽기 권한을 보완해 주세요.";
  }

  if (reason === "not_configured") {
    return "AWS에서 이 서비스의 조회 준비를 확인해 주세요.";
  }

  return "잠시 후 다시 시도해 주세요.";
}

// 아직 정식 변환하지 못한 AWS 리소스를 숨기지 않고 별도 목록으로 보여줍니다.
function UnsupportedResourceList({ resources }: { readonly resources: DiscoveredResource[] }) {
  if (resources.length === 0) {
    return <p className={styles.hint}>미지원 Resource가 없습니다.</p>;
  }

  return (
    <>
      <ul className={styles.resultList}>
        {resources.map((resource) => (
          <li key={resource.id} className={styles.resultItem}>
            <ResourceListIdentity resource={resource} />
            <span>연결된 Resource 수: {resource.relationships?.length ?? 0}</span>
            <span>
              이 Resource는 AWS에서 발견됐지만 현재 Reverse Engineering 자동 처리 범위가 아닙니다.
              Terraform 생성·import 제안·배포·확정 비용/보안 판단에는 포함하지 않습니다.
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

// 이번 스캔에서 발견한 Resource는 사람이 읽는 이름과 상태만 기본 목록에 보여줍니다.
function DiscoveredResourcePreview({
  resources
}: {
  readonly resources: readonly DiscoveredResource[];
}) {
  if (resources.length === 0) {
    return <p className={styles.hint}>아직 발견한 Resource가 없습니다.</p>;
  }

  return (
    <ul className={styles.resultList}>
      {resources.slice(0, 8).map((resource) => (
        <li key={resource.id} className={styles.resultItem}>
          <ResourceListIdentity resource={resource} />
        </li>
      ))}
    </ul>
  );
}

function ResourceListIdentity({ resource }: { readonly resource: DiscoveredResource }) {
  const presentation = presentReverseEngineeringResource(resource);

  return (
    <>
      <strong>{presentation.displayName}</strong>
      <span>{presentation.serviceLabel}</span>
      <span>{presentation.regionLabel}</span>
      <span
        className={
          presentation.displayState === "supported" ? styles.supportedBadge : styles.reviewOnlyBadge
        }
      >
        {presentation.statusLabel}
      </span>
    </>
  );
}

import type {
  ArchitectureBoardCompilationProposal,
  DiscoveredResource,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResponse,
  ReverseEngineeringScanError
} from "@sketchcatch/types";
import type { ReactNode } from "react";
import type {
  ReverseEngineeringBoardComparison,
  ReverseEngineeringPlacement
} from "./reverse-engineering-board-application";
import type { ReverseEngineeringBoardCandidate } from "./reverse-engineering-board-candidates";
import {
  createReverseEngineeringCompilationReview,
  formatCompilationScore
} from "./reverse-engineering-compilation-review";
import { ReverseEngineeringFindingsPanel } from "./ReverseEngineeringFindingsPanel";
import {
  presentReverseEngineeringResource,
  summarizeReverseEngineeringScan
} from "./reverse-engineering-presentation";
import { formatReverseEngineeringResourceTypeLabel } from "./reverse-engineering-resource-types";
import styles from "./reverse-engineering.module.css";

export type ReverseEngineeringApplyState = "idle" | "saving" | "saved" | "error";

export type ReverseEngineeringResultPanelProps = {
  readonly applyMessage: string | null;
  readonly applyState: ReverseEngineeringApplyState;
  readonly appendCompilation: ArchitectureBoardCompilationProposal | null;
  readonly boardCandidates: readonly ReverseEngineeringBoardCandidate[];
  readonly compilation: ArchitectureBoardCompilationProposal | null;
  readonly comparison: ReverseEngineeringBoardComparison;
  readonly createProjectOnApply: boolean;
  readonly hasCurrentBoardResources: boolean;
  readonly logs: ReverseEngineeringScanLogLine[];
  readonly onAppendToCurrentBoard: () => void;
  readonly onCompilePlacement: () => void;
  readonly onKeepOriginalPlacement: () => void;
  readonly onOpenAsNewBoard: () => void;
  readonly onRetryScan: () => void;
  readonly response: ReverseEngineeringScanResponse;
  readonly selectedCandidateId: string;
  readonly placement: ReverseEngineeringPlacement;
};

// 스캔 결과와 사용자가 누를 적용 버튼을 한 화면에 모아 보여줍니다.
export function ReverseEngineeringResultPanel({
  applyMessage,
  applyState,
  appendCompilation,
  compilation,
  comparison,
  createProjectOnApply,
  hasCurrentBoardResources,
  logs,
  onAppendToCurrentBoard,
  onCompilePlacement,
  onKeepOriginalPlacement,
  onOpenAsNewBoard,
  onRetryScan,
  placement,
  response
}: ReverseEngineeringResultPanelProps) {
  const result = response.result;

  if (!result) {
    return null;
  }

  const isApplying = applyState === "saving";
  const summary = summarizeReverseEngineeringScan(result);
  const unsupportedResources = result.discoveredResources.filter(
    (resource) => presentReverseEngineeringResource(resource).displayState === "review_only"
  );
  const primaryApplyLabel = getPrimaryApplyLabel({
    createProjectOnApply,
    hasCurrentBoardResources
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
        {summary.unreadableServiceCount > 0 ? (
          <p className={styles.warning}>
            일부 AWS 서비스를 읽지 못했습니다. 이 결과는 전체 AWS 환경을 완전히 보여주지 않을 수
            있습니다.
          </p>
        ) : null}
      </section>

      <section className={styles.placementDecision} aria-label="배치 선택">
        <div
          aria-atomic="true"
          aria-live="polite"
          className={styles.placementDecisionHeader}
        >
          <span className={styles.placementBadge}>
            {placement === "compiled" ? "컴파일러 미리보기" : "AWS 원본 배치"}
          </span>
          <h3>
            {placement === "compiled" ? "배치 컴파일러 결과 미리보기" : "AWS에서 읽어온 원래 배치"}
          </h3>
        </div>
        <p className={styles.placementDescription}>
          {placement === "compiled"
            ? "AWS 원본과 비교해 선택된 배치 후보를 보여드립니다. 아래의 실제 변화와 남은 확인 항목을 검토하세요."
            : "아직 배치 컴파일러를 실행하지 않았습니다. AWS에서 읽은 Resource와 관계를 원래 배치로 먼저 보여드립니다."}
        </p>
        <div className={styles.placementActions} role="group" aria-label="배치 미리보기 선택">
          <button
            aria-pressed={placement === "compiled"}
            className={styles.primaryButton}
            onClick={onCompilePlacement}
            type="button"
          >
            배치 컴파일러 실행
          </button>
          <button
            aria-pressed={placement === "original"}
            className={styles.secondaryButton}
            onClick={onKeepOriginalPlacement}
            type="button"
          >
            원래 배치 유지
          </button>
        </div>
        <p className={styles.placementSaveBoundary}>
          배치를 고르거나 컴파일러를 실행해도 저장되지 않습니다. 마지막 적용 버튼을 눌러야 보드에
          반영됩니다.
        </p>
      </section>

      {placement === "compiled" && compilation ? (
        <section className={styles.compilationReview} aria-label="배치 컴파일러 검토">
          <ReverseEngineeringCompilationModeReview
            proposal={compilation}
            title={hasCurrentBoardResources ? "새 보드로 열 때" : primaryApplyLabel}
          />
          {hasCurrentBoardResources && appendCompilation ? (
            <ReverseEngineeringCompilationModeReview
              proposal={appendCompilation}
              title="현재 보드에 추가할 때"
            />
          ) : null}
        </section>
      ) : null}

      <section className={styles.section} aria-label="선택한 배치 적용">
        <h3>선택한 배치 적용</h3>
        <p className={styles.sectionDescription}>
          {placement === "compiled" ? "컴파일러 결과" : "원래 AWS 배치"}를 확인한 뒤 원하는 적용
          방식을 선택하세요.
        </p>
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
          <p
            className={applyState === "error" ? styles.error : styles.success}
            role={applyState === "error" ? "alert" : "status"}
          >
            {applyMessage}
          </p>
        ) : null}
      </section>

      <ReverseEngineeringDetailGroup title="부분 실패">
        <ReverseEngineeringScanCoveragePanel
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

      <ReverseEngineeringDetailGroup title="스캔 로그">
        <ReverseEngineeringLogList logs={logs} />
      </ReverseEngineeringDetailGroup>
    </>
  );
}

function ReverseEngineeringCompilationModeReview({
  proposal,
  title
}: {
  readonly proposal: ArchitectureBoardCompilationProposal;
  readonly title: string;
}) {
  const review = createReverseEngineeringCompilationReview(proposal);

  return (
    <article className={styles.compilationModeReview} aria-label={`${title} 배치 결과`}>
      <div className={styles.compilationReviewHeader}>
        <div>
          <span>{title}</span>
          <h3>{review.outcome.headline}</h3>
        </div>
        <strong>{review.changeCount}개 변경</strong>
      </div>
      <p className={styles.compilationReviewSummary}>{review.outcome.reviewSummary}</p>
      {review.outcome.items.length > 0 ? (
        <ul className={styles.compilationOutcomes}>
          {review.outcome.items.map((item) => (
            <li data-tone={item.tone} key={item.key}>
              <span>{item.label}</span>
              <strong>{item.summary}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.compilationHint}>추적 지표에서 표시할 배치 문제가 없습니다.</p>
      )}
      {review.diagnostics.length > 0 ? (
        <ul className={styles.compilationDiagnostics}>
          {review.diagnostics.map((presentation) => (
            <li key={presentation.key} data-level={presentation.level}>
              <strong>{presentation.summary}</strong>
              <span>{presentation.message}</span>
            </li>
          ))}
          {review.hiddenDiagnosticCount > 0 ? (
            <li className={styles.compilationDiagnosticRemainder}>
              확인 항목 {review.hiddenDiagnosticCount}개 더 있음
            </li>
          ) : null}
        </ul>
      ) : null}
      <details className={styles.compilationTechnical}>
        <summary>기술 세부 정보</summary>
        <div className={styles.compilationTechnicalBody}>
          <dl>
            <div>
              <dt>내부 cost (낮을수록 우선)</dt>
              <dd>
                {formatCompilationScore(review.quality.before.score)} →{" "}
                {formatCompilationScore(review.quality.after.score)}
              </dd>
            </div>
            <div>
              <dt>변경 cost</dt>
              <dd>{formatCompilationScore(review.quality.compilationDistance)}</dd>
            </div>
          </dl>
          <p>후보: {proposal.provenance.candidateId}</p>
          <p>Compiler: {proposal.provenance.compilerVersion}</p>
          <p>참고 규칙: {review.referenceTemplateIds.join(" · ") || "일반 배치 규칙"}</p>
        </div>
      </details>
    </article>
  );
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
  scanErrors
}: {
  readonly onRetryScan: () => void;
  readonly scanErrors: ReverseEngineeringScanError[];
}) {
  const notice = getScanCoverageNotice(scanErrors);
  const hasRetryableScanError = scanErrors.some((scanError) => scanError.retryable);

  return (
    <div>
      <p className={scanErrors.length > 0 ? styles.warning : styles.hint}>{notice}</p>
      {scanErrors.length > 0 ? (
        <details className={styles.detail}>
          <summary className={styles.detailSummary}>못 읽은 서비스 자세히 보기</summary>
          <div className={styles.detailBody}>
            <ul className={styles.resultList}>
              {scanErrors.map((scanError, index) => (
                <li key={`${scanError.id}-${index}`} className={styles.resultItem}>
                  <strong>
                    {formatReverseEngineeringResourceTypeLabel(scanError.resourceType)}
                  </strong>
                  <span className={styles.errorBadge}>읽기 실패</span>
                  <span>{scanError.message}</span>
                  <span>{formatRetryableStatus(scanError.retryable)}</span>
                  <details className={styles.diagnosticDetails}>
                    <summary>진단 정보</summary>
                    <span>
                      stage: {scanError.stage} · reason: {scanError.reason} · retryable:{" "}
                      {String(scanError.retryable)}
                    </span>
                  </details>
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

// 스캔 진행 중 서버가 남긴 단계별 로그를 시간 순서대로 보여줍니다.
function ReverseEngineeringLogList({
  logs
}: {
  readonly logs: readonly ReverseEngineeringScanLogLine[];
}) {
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

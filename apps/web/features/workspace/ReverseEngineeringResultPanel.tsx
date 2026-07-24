import type {
  DiscoveredResource,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResponse,
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage
} from "@sketchcatch/types";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import type {
  ReverseEngineeringBoardApplicationMode,
  ReverseEngineeringBoardComparison,
  ReverseEngineeringPlacement
} from "./reverse-engineering-board-application";
import type { ReverseEngineeringBoardCandidate } from "./reverse-engineering-board-candidates";
import type { ReverseEngineeringImportDecisionOptions } from "./reverse-engineering-import-decision";
import { setupModalAccessibility } from "../../components/ui/modal-accessibility";
import { ReverseEngineeringFindingsPanel } from "./ReverseEngineeringFindingsPanel";
import {
  presentReverseEngineeringResource,
  presentReverseEngineeringScanErrors,
  summarizeReverseEngineeringScan
} from "./reverse-engineering-presentation";
import styles from "./reverse-engineering.module.css";

export type ReverseEngineeringApplyState = "idle" | "saving" | "saved" | "partial" | "error";
export type ReverseEngineeringResultPanelProps = {
  readonly acknowledgedReviewOnlyResourceIds: readonly string[];
  readonly applyMessage: string | null;
  readonly applicationMode: ReverseEngineeringBoardApplicationMode;
  readonly applyState: ReverseEngineeringApplyState;
  readonly boardCandidates: readonly ReverseEngineeringBoardCandidate[];
  readonly comparison: ReverseEngineeringBoardComparison;
  readonly createProjectOnApply: boolean;
  readonly hasCurrentBoardResources: boolean;
  readonly importDecisionComplete: boolean;
  readonly importDecisionOptions: ReverseEngineeringImportDecisionOptions;
  readonly logs: ReverseEngineeringScanLogLine[];
  readonly layoutSummary: readonly string[];
  readonly onAppendToCurrentBoard: () => void;
  readonly onApplicationModeChange: (mode: ReverseEngineeringBoardApplicationMode) => void;
  readonly onCompilePlacement: () => void;
  readonly onKeepOriginalPlacement: () => void;
  readonly onReadyResourceToggle: (resourceId: string) => void;
  readonly onReplaceCurrentBoard: () => void;
  readonly onRetryScan: () => void;
  readonly onReviewOnlyResourceToggle: (resourceId: string) => void;
  readonly permissionRecoveryHref: string;
  readonly response: ReverseEngineeringScanResponse;
  readonly selectedReadyResourceIds: readonly string[];
  readonly selectedCandidateId: string;
  readonly placement: ReverseEngineeringPlacement;
};

const REVERSE_ENGINEERING_RESOURCE_CATEGORIES = [
  { key: "network", label: "네트워크" },
  { key: "compute", label: "서버·컴퓨팅" },
  { key: "data", label: "데이터·저장소" },
  { key: "security", label: "보안·권한" },
  { key: "other", label: "기타" }
] as const;

type ReverseEngineeringResourceCategory =
  (typeof REVERSE_ENGINEERING_RESOURCE_CATEGORIES)[number]["key"];

const NETWORK_PROVIDER_RESOURCE_TYPES = new Set([
  "AWS::EC2::EIP",
  "AWS::EC2::InternetGateway",
  "AWS::EC2::NatGateway",
  "AWS::EC2::NetworkAcl",
  "AWS::EC2::NetworkAclEntry",
  "AWS::EC2::RouteTable",
  "AWS::EC2::RouteTableAssociation",
  "AWS::EC2::Subnet",
  "AWS::EC2::SubnetRouteTableAssociation",
  "AWS::EC2::VPC",
  "AWS::EC2::VPCEndpoint",
  "AWS::EC2::VPCPeeringConnection",
  "AWS::EC2::VPCPeeringConnectionAccepter"
]);

const NETWORK_PROVIDER_RESOURCE_PREFIXES = [
  "AWS::APIGateway::",
  "AWS::ApiGateway::",
  "AWS::ApiGatewayV2::",
  "AWS::CloudFront::",
  "AWS::ElasticLoadBalancingV2::",
  "AWS::Route53::"
] as const;

const COMPUTE_PROVIDER_RESOURCE_PREFIXES = [
  "AWS::Amplify::",
  "AWS::ApplicationAutoScaling::",
  "AWS::AutoScaling::",
  "AWS::CodeBuild::",
  "AWS::ECR::",
  "AWS::ECS::",
  "AWS::EKS::",
  "AWS::Lambda::"
] as const;

const COMPUTE_PROVIDER_RESOURCE_TYPES = new Set([
  "AWS::EC2::Image",
  "AWS::EC2::Instance",
  "AWS::EC2::LaunchTemplate"
]);

const DATA_PROVIDER_RESOURCE_PREFIXES = [
  "AWS::DynamoDB::",
  "AWS::EFS::",
  "AWS::ElastiCache::",
  "AWS::RDS::",
  "AWS::S3::"
] as const;

const DATA_PROVIDER_RESOURCE_TYPES = new Set([
  "AWS::EC2::Volume",
  "AWS::EC2::VolumeAttachment"
]);

const SECURITY_PROVIDER_RESOURCE_PREFIXES = [
  "AWS::CertificateManager::",
  "AWS::CloudTrail::",
  "AWS::Cognito::",
  "AWS::Config::",
  "AWS::GuardDuty::",
  "AWS::IAM::",
  "AWS::KMS::",
  "AWS::SecretsManager::",
  "AWS::Shield::",
  "AWS::WAF::",
  "AWS::WAFRegional::",
  "AWS::WAFv2::"
] as const;

const SECURITY_PROVIDER_RESOURCE_TYPES = new Set([
  "AWS::EC2::KeyPair",
  "AWS::EC2::SecurityGroup",
  "AWS::Lambda::Permission"
]);

// 기본 화면에는 보드 미리보기와 사용자가 바로 고를 행동만 남깁니다.
export function ReverseEngineeringResultPanel({
  acknowledgedReviewOnlyResourceIds,
  applyMessage,
  applicationMode,
  applyState,
  comparison,
  hasCurrentBoardResources,
  importDecisionComplete,
  importDecisionOptions,
  layoutSummary,
  onAppendToCurrentBoard,
  onApplicationModeChange,
  onCompilePlacement,
  onKeepOriginalPlacement,
  onReadyResourceToggle,
  onReplaceCurrentBoard,
  onReviewOnlyResourceToggle,
  permissionRecoveryHref,
  placement,
  response,
  selectedReadyResourceIds
}: ReverseEngineeringResultPanelProps) {
  const result = response.result;
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");
  const [isOrganizing, setIsOrganizing] = useState(false);
  const detailsOverlayRef = useRef<HTMLDivElement>(null);
  const detailsDialogRef = useRef<HTMLElement>(null);
  const detailsCloseButtonRef = useRef<HTMLButtonElement>(null);
  const organizeFrameRef = useRef<number | null>(null);
  const organizeTimerRef = useRef<number | null>(null);

  // 예약된 정리 작업은 화면을 떠날 때 실행되지 않게 정리합니다.
  useEffect(() => {
    return () => {
      if (organizeFrameRef.current !== null) {
        window.cancelAnimationFrame(organizeFrameRef.current);
      }

      if (organizeTimerRef.current !== null) {
        window.clearTimeout(organizeTimerRef.current);
      }
    };
  }, []);

  // gg: 상세 창은 공통 Modal 도우미가 열기 focus·Tab 경계·Escape·원래 트리거 복귀를 함께 처리합니다.
  useEffect(() => {
    if (!isDetailsOpen) {
      return;
    }

    const overlay = detailsOverlayRef.current;
    const dialog = detailsDialogRef.current;
    const closeButton = detailsCloseButtonRef.current;

    if (!overlay || !dialog || !closeButton) {
      return;
    }

    return setupModalAccessibility({
      closeButton,
      dialog,
      documentRoot: document,
      onClose: () => setIsDetailsOpen(false),
      overlay
    });
  }, [isDetailsOpen]);

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
  const filteredResources = filterReverseEngineeringResources(
    result.discoveredResources,
    detailSearch
  );
  const resourceCategoryCounts = countReverseEngineeringResourceCategories(
    result.discoveredResources
  );
  const connectionCount = result.architectureJson.edges.length;
  const selectedApplyDisabled =
    isApplying ||
    !hasApplicableResources ||
    !importDecisionComplete ||
    (applicationMode === "append" && comparison.additions.length === 0);

  // 정리 계산 전에 진행 상태를 한 번 그려 긴 계산이 멈춤처럼 보이지 않게 합니다.
  function handleCompilePlacement(): void {
    if (isOrganizing || placement === "compiled") {
      return;
    }

    setIsOrganizing(true);
    organizeFrameRef.current = window.requestAnimationFrame(() => {
      organizeTimerRef.current = window.setTimeout(() => {
        try {
          onCompilePlacement();
        } finally {
          organizeTimerRef.current = null;
          setIsOrganizing(false);
        }
      }, 0);
    });
  }

  // 상세 창에서 고른 교체·추가 방식을 기본 적용 버튼 하나로 실행합니다.
  function handleApplyToBoard(): void {
    if (selectedApplyDisabled) {
      return;
    }

    if (hasCurrentBoardResources && applicationMode === "append") {
      onAppendToCurrentBoard();
      return;
    }

    onReplaceCurrentBoard();
  }

  // 배경을 직접 누른 경우에만 상세 창을 닫아 내부 클릭을 보호합니다.
  function handleDetailsBackdropClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      setIsDetailsOpen(false);
    }
  }

  return (
    <>
      <section aria-label="미리보기" className={styles.previewCard}>
        <div aria-atomic="true" aria-live="polite" className={styles.previewHeader}>
          <div>
            <span className={styles.placementBadge}>
              {placement === "compiled" ? "정리본" : "원본"}
            </span>
            <h3>미리보기</h3>
          </div>
          <p>{placement === "compiled" ? "보기 좋게 정리한 배치" : "AWS에서 가져온 배치"}</p>
        </div>
        <div className={styles.previewCounts}>
          <span>
            리소스
            <strong>{summary.boardCount}</strong>
          </span>
          <span>
            연결
            <strong>{connectionCount}</strong>
          </span>
        </div>
        {hasPartialFailure ? (
          <p className={styles.warning} role="status">
            일부 AWS 서비스를 읽지 못했어요. 가져온 항목만 보드에 적용합니다.
          </p>
        ) : null}
        <div className={styles.previewActions}>
          <button
            aria-busy={isApplying}
            className={styles.primaryButton}
            disabled={selectedApplyDisabled}
            onClick={handleApplyToBoard}
            type="button"
          >
            보드에 적용
          </button>
          <button
            aria-pressed={placement === "compiled"}
            className={styles.secondaryButton}
            disabled={isOrganizing || placement === "compiled"}
            onClick={handleCompilePlacement}
            type="button"
          >
            {isOrganizing ? (
              <LoaderCircle aria-hidden="true" className={styles.spinner} size={16} />
            ) : null}
            <span>{isOrganizing ? "정리하는 중…" : "보기 좋게 정리"}</span>
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => setIsDetailsOpen(true)}
            type="button"
          >
            상세 정보
          </button>
        </div>
        {!hasApplicableResources ? (
          <p className={styles.warning} role="status">
            보드에 표시할 항목이 없습니다.
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

      <div
        aria-hidden={!isDetailsOpen}
        className={styles.detailsBackdrop}
        hidden={!isDetailsOpen}
        onMouseDown={handleDetailsBackdropClick}
        ref={detailsOverlayRef}
      >
        <section
          aria-labelledby="reverse-engineering-details-title"
          aria-modal="true"
          className={styles.detailsDialog}
          ref={detailsDialogRef}
          role="dialog"
        >
          <header className={styles.detailsDialogHeader}>
            <div>
              <span className={styles.eyebrow}>Reverse Engineering</span>
              <h2 id="reverse-engineering-details-title">상세 정보</h2>
              <p>가져온 리소스와 적용 범위를 확인합니다.</p>
            </div>
            <button
              aria-label="상세 정보 닫기"
              className={styles.iconButton}
              onClick={() => setIsDetailsOpen(false)}
              ref={detailsCloseButtonRef}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </header>

          <div className={styles.detailsDialogBody}>
            <section
              aria-label="리소스 종류별 개수"
              className={styles.detailResourceCategorySummary}
            >
              <h3>리소스 구성</h3>
              <div className={styles.detailResourceCategoryCounts}>
                {REVERSE_ENGINEERING_RESOURCE_CATEGORIES.map((category) => (
                  <span key={category.key}>
                    {category.label}
                    <strong>{resourceCategoryCounts[category.key]}</strong>
                  </span>
                ))}
              </div>
            </section>

            <label className={styles.detailsSearch}>
              <Search aria-hidden="true" size={16} />
              <span className={styles.visuallyHidden}>리소스 검색</span>
              <input
                onChange={(event) => setDetailSearch(event.currentTarget.value)}
                placeholder="리소스 이름 또는 종류 검색"
                type="search"
                value={detailSearch}
              />
            </label>

            <div aria-label="리소스 분류" className={styles.detailCategoryCounts}>
              <span>
                전체 <strong>{summary.discoveredCount}</strong>
              </span>
              <span>
                수정 가능 <strong>{importDecisionOptions.ready.length}</strong>
              </span>
              <span>
                확인 필요 <strong>{importDecisionOptions.reviewOnly.length}</strong>
              </span>
              <span>
                못 읽음 <strong>{summary.unreadableServiceCount}</strong>
              </span>
            </div>

            <p className={styles.detailLimitNotice}>
              보드에 표시되지 않거나 읽지 못한 항목은 자동으로 적용하지 않습니다.
            </p>

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

            <section className={styles.detailSection}>
              <h3>미리보기 설정</h3>
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
                  aria-pressed={placement === "original"}
                  className={styles.secondaryButton}
                  onClick={onKeepOriginalPlacement}
                  type="button"
                >
                  원본 유지
                </button>
                <button
                  aria-pressed={placement === "compiled"}
                  className={styles.secondaryButton}
                  disabled={isOrganizing || placement === "compiled"}
                  onClick={handleCompilePlacement}
                  type="button"
                >
                  {isOrganizing ? "정리하는 중…" : "보기 좋게 정리"}
                </button>
              </div>
              <p className={styles.hint}>
                미리보기만 바뀝니다. 보드에 적용하기 전에는 저장되지 않습니다.
              </p>
              {placement === "compiled" && layoutSummary.length > 0 ? (
                <ul className={styles.compactSummary}>
                  {layoutSummary.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className={styles.detailSection} aria-label="Terraform 가져오기 선택">
              <h3>Terraform으로 관리할 리소스 선택</h3>
              <p className={styles.sectionDescription}>
                선택한 리소스만 기존 AWS 리소스로 가져와 수정할 수 있게 합니다.
              </p>
              {importDecisionOptions.ready.length > 0 ? (
                <ul className={styles.importDecisionList}>
                  {importDecisionOptions.ready.map((option) => (
                    <li className={styles.importDecisionItem} key={option.id}>
                      <label>
                        <input
                          checked={selectedReadyResourceIds.includes(option.id)}
                          onChange={() => onReadyResourceToggle(option.id)}
                          type="checkbox"
                        />
                        <span className={styles.importDecisionCopy}>
                          <strong>{option.label}</strong>
                          <span>기존 AWS 리소스를 Terraform으로 가져와 수정할 수 있게 합니다.</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.hint}>
                  이번 적용에서 바로 Terraform으로 가져올 리소스는 없습니다.
                </p>
              )}

              {importDecisionOptions.reviewOnly.length > 0 ? (
                <div className={styles.importDecisionReview}>
                  <strong>보드에서만 확인할 리소스</strong>
                  <p>아래 항목은 내용을 확인해야 계속할 수 있습니다.</p>
                  <ul className={styles.importDecisionList}>
                    {importDecisionOptions.reviewOnly.map((option) => (
                      <li className={styles.importDecisionItem} key={option.id}>
                        <label>
                          <input
                            checked={acknowledgedReviewOnlyResourceIds.includes(option.id)}
                            onChange={() => onReviewOnlyResourceToggle(option.id)}
                            type="checkbox"
                          />
                          <span className={styles.importDecisionCopy}>
                            <strong>{option.label}</strong>
                            <span>
                              {option.status === "unsupported_resource_type"
                                ? "현재 보드에서 수정하거나 배포할 수 없는 종류입니다."
                                : "Terraform으로 옮기기 전에 추가 확인이 필요합니다."}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {importDecisionOptions.invalidResourceIds.length > 0 ? (
                <p className={styles.error} role="alert">
                  가져오기 상태를 확인하지 못한 리소스가 있습니다.
                </p>
              ) : !importDecisionComplete ? (
                <p className={styles.warning} role="status">
                  보드에서만 확인할 리소스를 모두 확인해 주세요.
                </p>
              ) : null}
            </section>

            <section className={styles.detailSection}>
              <h3>가져온 리소스</h3>
              <DiscoveredResourcePreview resources={filteredResources} />
            </section>

            <section className={styles.detailSection}>
              <h3>읽지 못한 범위</h3>
              <ReverseEngineeringScanCoveragePanel
                coverage={result.coverage}
                scanErrors={result.scanErrors}
              />
            </section>

            <section className={styles.detailSection}>
              <ReverseEngineeringFindingsPanel
                analysisExclusions={result.analysisExclusions}
                findings={result.findings}
                resources={result.discoveredResources}
              />
            </section>

            <section className={styles.detailSection}>
              <h3>보드에서만 확인할 리소스</h3>
              <UnsupportedResourceList resources={unsupportedResources} />
            </section>
          </div>
        </section>
      </div>
    </>
  );
}

// 상세 화면은 AWS 서비스 이름을 사용자가 이해하기 쉬운 다섯 묶음으로 요약합니다.
function countReverseEngineeringResourceCategories(
  resources: readonly DiscoveredResource[]
): Readonly<Record<ReverseEngineeringResourceCategory, number>> {
  const counts: Record<ReverseEngineeringResourceCategory, number> = {
    network: 0,
    compute: 0,
    data: 0,
    security: 0,
    other: 0
  };

  for (const resource of resources) {
    counts[getReverseEngineeringResourceCategory(resource.providerResourceType)] += 1;
  }

  return counts;
}

function getReverseEngineeringResourceCategory(
  providerResourceType: string
): ReverseEngineeringResourceCategory {
  if (
    SECURITY_PROVIDER_RESOURCE_TYPES.has(providerResourceType) ||
    SECURITY_PROVIDER_RESOURCE_PREFIXES.some((prefix) => providerResourceType.startsWith(prefix))
  ) {
    return "security";
  }

  if (
    NETWORK_PROVIDER_RESOURCE_TYPES.has(providerResourceType) ||
    NETWORK_PROVIDER_RESOURCE_PREFIXES.some((prefix) => providerResourceType.startsWith(prefix))
  ) {
    return "network";
  }

  if (
    COMPUTE_PROVIDER_RESOURCE_TYPES.has(providerResourceType) ||
    COMPUTE_PROVIDER_RESOURCE_PREFIXES.some((prefix) => providerResourceType.startsWith(prefix))
  ) {
    return "compute";
  }

  if (
    DATA_PROVIDER_RESOURCE_TYPES.has(providerResourceType) ||
    DATA_PROVIDER_RESOURCE_PREFIXES.some((prefix) => providerResourceType.startsWith(prefix))
  ) {
    return "data";
  }

  return "other";
}

// 사용자가 적용하기 전에 이번 스캔이 전체 결과인지 부분 결과인지 먼저 알려줍니다.
function ReverseEngineeringScanCoveragePanel({
  coverage,
  scanErrors
}: {
  readonly coverage?: ReverseEngineeringServiceCoverage | undefined;
  readonly scanErrors: ReverseEngineeringScanError[];
}) {
  const notice = getScanCoverageNotice(coverage, scanErrors);
  const hasPartialFailure = coverage ? coverage.status === "partial" : scanErrors.length > 0;
  const detailedPresentations = new Map(
    presentReverseEngineeringScanErrors(scanErrors).map((presentation) => [
      presentation.key,
      presentation
    ])
  );
  const presentations = coverage
    ? coverage.unavailableServices.map((service) => {
        const detailedPresentation = detailedPresentations.get(service.serviceKey);

        return {
          key: service.serviceKey,
          serviceName: service.displayName,
          causeLabel: detailedPresentation?.causeLabel ?? getCoverageCauseLabel(service.reason),
          remedy: getCoverageRemedy(service.reason)
        };
      })
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
                  <span className={styles.errorBadge}>{presentation.causeLabel}</span>
                  <span>{presentation.remedy}</span>
                </li>
              ))}
            </ul>
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

function getCoverageCauseLabel(
  reason: ReverseEngineeringServiceCoverage["unavailableServices"][number]["reason"]
): string {
  if (reason === "permission_required") {
    return "권한 부족";
  }

  if (reason === "not_configured") {
    return "서비스 준비 필요";
  }

  return "다시 시도 필요";
}

// 아직 정식 변환하지 못한 AWS 리소스를 숨기지 않고 별도 목록으로 보여줍니다.
function UnsupportedResourceList({ resources }: { readonly resources: DiscoveredResource[] }) {
  if (resources.length === 0) {
    return <p className={styles.hint}>보드에만 표시하는 리소스가 없습니다.</p>;
  }

  return (
    <>
      <ul className={styles.resultList}>
        {resources.map((resource) => (
          <li key={resource.id} className={styles.resultItem}>
            <ResourceListIdentity resource={resource} />
            <span>연결된 Resource 수: {resource.relationships?.length ?? 0}</span>
            <span>
              AWS에서 찾은 리소스입니다. 구조 확인을 위해 보드에 표시하지만 Terraform 생성과
              배포에는 자동으로 사용하지 않습니다.
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

// 상세 검색 결과는 사람이 읽는 이름과 상태만 보여줍니다.
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
      {resources.map((resource) => (
        <li key={resource.id} className={styles.resultItem}>
          <ResourceListIdentity resource={resource} />
        </li>
      ))}
    </ul>
  );
}

// 상세 검색은 긴 AWS 식별자 대신 화면에 보이는 이름과 분류를 기준으로 찾습니다.
function filterReverseEngineeringResources(
  resources: readonly DiscoveredResource[],
  query: string
): readonly DiscoveredResource[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");

  if (!normalizedQuery) {
    return resources;
  }

  return resources.filter((resource) => {
    const presentation = presentReverseEngineeringResource(resource);
    const searchableText = [
      presentation.displayName,
      presentation.serviceLabel,
      presentation.regionLabel,
      presentation.statusLabel
    ]
      .join(" ")
      .toLocaleLowerCase("ko-KR");

    return searchableText.includes(normalizedQuery);
  });
}

// 상세 목록에서는 내부 ID 대신 짧은 이름과 상태만 유지합니다.
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

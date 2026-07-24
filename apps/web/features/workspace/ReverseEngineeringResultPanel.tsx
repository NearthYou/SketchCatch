import type {
  DiscoveredResource,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResponse,
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage
} from "@sketchcatch/types";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import type {
  ReverseEngineeringBoardApplicationMode,
  ReverseEngineeringBoardComparison,
  ReverseEngineeringPlacement
} from "./reverse-engineering-board-application";
import type { ReverseEngineeringBoardCandidate } from "./reverse-engineering-board-candidates";
import { setupModalAccessibility } from "../../components/ui/modal-accessibility";
import { ReverseEngineeringFindingsPanel } from "./ReverseEngineeringFindingsPanel";
import {
  buildReverseEngineeringResourceAccordionModel,
  getSearchExpandedReverseEngineeringResourceCategories,
  type ReverseEngineeringDetailSectionKey,
  type ReverseEngineeringResourceCategoryGroup,
  type ReverseEngineeringResourceCategoryKey
} from "./reverse-engineering-detail-model";
import { getReverseEngineeringInspectorCoreValues } from "./reverse-engineering-resource-inspector";
import {
  getReverseEngineeringProviderTypeLabel,
  presentReverseEngineeringResource,
  presentReverseEngineeringScanErrors,
  summarizeReverseEngineeringScan
} from "./reverse-engineering-presentation";
import styles from "./reverse-engineering.module.css";

export type ReverseEngineeringApplyState = "idle" | "saving" | "saved" | "partial" | "error";

// API가 이미 정제하지만, 과거 저장 결과도 실제 reader가 쓰는 AWS 서비스 action만 다시 표시합니다.
const SAFE_REVERSE_ENGINEERING_READ_ACTION_PREFIXES = [
  "apigateway",
  "application-autoscaling",
  "cloudformation",
  "cloudfront",
  "cloudwatch",
  "ec2",
  "ecr",
  "ecs",
  "elasticloadbalancing",
  "events",
  "iam",
  "kms",
  "lambda",
  "logs",
  "rds",
  "resource-explorer-2",
  "s3",
  "secretsmanager",
  "tag"
] as const;

export type ReverseEngineeringResultPanelProps = {
  readonly applyMessage: string | null;
  readonly applicationMode: ReverseEngineeringBoardApplicationMode;
  readonly applyState: ReverseEngineeringApplyState;
  readonly boardCandidates: readonly ReverseEngineeringBoardCandidate[];
  readonly comparison: ReverseEngineeringBoardComparison;
  readonly createProjectOnApply: boolean;
  readonly hasCurrentBoardResources: boolean;
  readonly logs: ReverseEngineeringScanLogLine[];
  readonly layoutSummary: readonly string[];
  readonly onAppendToCurrentBoard: () => void;
  readonly onApplicationModeChange: (mode: ReverseEngineeringBoardApplicationMode) => void;
  readonly onCompilePlacement: () => void;
  readonly onKeepOriginalPlacement: () => void;
  readonly onReplaceCurrentBoard: () => void;
  readonly onRetryScan: () => void;
  readonly permissionRecoveryHref: string;
  readonly response: ReverseEngineeringScanResponse;
  readonly selectedCandidateId: string;
  readonly placement: ReverseEngineeringPlacement;
};

// 기본 화면에는 보드 미리보기와 사용자가 바로 고를 행동만 남깁니다.
export function ReverseEngineeringResultPanel({
  applyMessage,
  applicationMode,
  applyState,
  comparison,
  hasCurrentBoardResources,
  layoutSummary,
  onAppendToCurrentBoard,
  onApplicationModeChange,
  onCompilePlacement,
  onKeepOriginalPlacement,
  onReplaceCurrentBoard,
  permissionRecoveryHref,
  placement,
  response
}: ReverseEngineeringResultPanelProps) {
  const result = response.result;
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");
  const [openDetailSections, setOpenDetailSections] = useState<
    ReadonlySet<ReverseEngineeringDetailSectionKey>
  >(() => new Set(["summary"]));
  const [openResourceCategories, setOpenResourceCategories] = useState<
    ReadonlySet<ReverseEngineeringResourceCategoryKey>
  >(() => new Set());
  const [openResourceIds, setOpenResourceIds] = useState<ReadonlySet<string>>(() => new Set());
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
    : result.scanErrors.some((scanError) => scanError.reason !== "unsupported");
  const scanStatusLabel = getReverseEngineeringScanStatusLabel(response.scan.status, result.coverage);
  const scanTimeLabel = formatReverseEngineeringScanTime(response.scan);
  const hasAwsSettingsRecovery = result.coverage
    ? result.coverage.unavailableServices.some((service) => service.remedy === "open_settings")
    : result.scanErrors.some(
        (scanError) =>
          scanError.reason === "permission_denied" ||
          scanError.reason === "not_configured" ||
          scanError.reason === "invalid_region" ||
          scanError.reason === "expired_credential"
      );
  const resourceAccordionModel = buildReverseEngineeringResourceAccordionModel({
    resources: result.discoveredResources,
    coverage: result.coverage,
    scanErrors: result.scanErrors,
    search: detailSearch
  });
  const searchExpandedResourceCategories = getSearchExpandedReverseEngineeringResourceCategories(
    resourceAccordionModel
  );
  const isResourceSearchActive = resourceAccordionModel.normalizedSearch.length > 0;
  const resourceDisplayNames = new Map(
    result.discoveredResources.map((resource) => [
      resource.id,
      presentReverseEngineeringResource(resource).displayName
    ])
  );
  const resourceWarningsById = createResourceWarningsById(result);
  const connectionCount = result.architectureJson.edges.length;
  const discoveredRelationshipCount = result.discoveredResources.reduce(
    (total, resource) => total + (resource.relationships?.length ?? 0),
    0
  );
  const selectedApplyDisabled =
    isApplying ||
    !hasApplicableResources ||
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

  function openDetails(): void {
    setDetailSearch("");
    setOpenDetailSections(new Set(["summary"]));
    setOpenResourceCategories(new Set());
    setOpenResourceIds(new Set());
    setIsDetailsOpen(true);
  }

  function toggleDetailSection(sectionKey: ReverseEngineeringDetailSectionKey): void {
    setOpenDetailSections((current) => toggleAccordionSet(current, sectionKey));
  }

  function toggleResourceCategory(categoryKey: ReverseEngineeringResourceCategoryKey): void {
    if (isResourceSearchActive) {
      return;
    }

    setOpenResourceCategories((current) => toggleAccordionSet(current, categoryKey));
  }

  function toggleResource(resourceId: string): void {
    setOpenResourceIds((current) => toggleAccordionSet(current, resourceId));
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
          <>
            <p className={styles.warning} role="status">
              일부 AWS 서비스를 읽지 못했어요. 가져온 항목만 보드에 적용합니다.
            </p>
            {hasAwsSettingsRecovery ? (
              <a className={styles.secondaryButton} href={permissionRecoveryHref}>
                AWS 연결 설정
              </a>
            ) : null}
          </>
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
            onClick={openDetails}
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
            <DetailAccordionSection
              id="reverse-engineering-detail-summary"
              isOpen={openDetailSections.has("summary")}
              meta={`리소스 ${summary.discoveredCount}개`}
              onToggle={() => toggleDetailSection("summary")}
              title="가져오기 요약"
            >
              <div aria-label="가져오기 요약 수치" className={styles.summaryStats}>
                <span>
                  전체 리소스
                  <strong>{summary.discoveredCount}</strong>
                </span>
                <span>
                  연결
                  <strong>{connectionCount}</strong>
                </span>
                <span>
                  보드 표시
                  <strong>{summary.boardCount}</strong>
                </span>
                <span>
                  추가 확인
                  <strong>{summary.reviewOnlyCount}</strong>
                </span>
                <span>
                  읽지 못한 서비스
                  <strong>{summary.unreadableServiceCount}</strong>
                </span>
                <span>
                  스캔 상태
                  <strong>{scanStatusLabel}</strong>
                </span>
                <span>
                  스캔 시간
                  <strong>{scanTimeLabel}</strong>
                </span>
              </div>
              <p className={styles.detailLimitNotice}>
                보드에 적용은 가져온 구조를 보드에 저장하는 동작입니다. 이 화면에서 Terraform 코드 생성,
                import, AWS 변경은 실행하지 않습니다.
              </p>
              {hasPartialFailure ? (
                <div className={styles.warning} role="alert">
                  <strong>일부 AWS 항목을 가져오지 못했어요</strong>
                  <p>읽은 리소스와 연결은 유지하고, 읽지 못한 범위는 별도로 표시합니다.</p>
                  {hasAwsSettingsRecovery ? (
                    <a className={styles.secondaryButton} href={permissionRecoveryHref}>
                      환경설정에서 권한 보완
                    </a>
                  ) : null}
                </div>
              ) : null}
              <section className={styles.detailSubsection}>
                <h4>미리보기 설정</h4>
                {hasCurrentBoardResources ? (
                  <div
                    className={styles.placementActions}
                    role="group"
                    aria-label="적용 방식 미리보기"
                  >
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
            </DetailAccordionSection>

            <DetailAccordionSection
              id="reverse-engineering-detail-resources"
              isOpen={
                isResourceSearchActive || openDetailSections.has("resources")
              }
              meta={`리소스 ${summary.discoveredCount}개`}
              onToggle={() => {
                if (!isResourceSearchActive) {
                  toggleDetailSection("resources");
                }
              }}
              title="가져온 리소스"
            >
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
              <p className={styles.hint}>
                {isResourceSearchActive
                  ? "검색 결과가 있는 카테고리만 펼쳐서 보여줍니다."
                  : "카테고리를 열어 리소스의 원본 정보와 읽기 상태를 확인하세요."}
              </p>
              <div aria-label="리소스 카테고리" className={styles.resourceCategoryAccordions}>
                {resourceAccordionModel.groups.map((group) => (
                  <ResourceCategoryAccordion
                    group={group}
                    isOpen={
                      isResourceSearchActive
                        ? searchExpandedResourceCategories.has(group.key)
                        : openResourceCategories.has(group.key)
                    }
                    key={group.key}
                    onToggle={() => toggleResourceCategory(group.key)}
                    openResourceIds={openResourceIds}
                    resourceDisplayNames={resourceDisplayNames}
                    resourceWarningsById={resourceWarningsById}
                    visibleResources={
                      isResourceSearchActive ? group.matchingResources : group.resources
                    }
                    onResourceToggle={toggleResource}
                  />
                ))}
              </div>
              {resourceAccordionModel.unclassifiedUnreadableServiceCount > 0 ? (
                <p className={styles.warning}>
                  카테고리를 알 수 없는 읽기 실패: {resourceAccordionModel.unclassifiedUnreadableServiceNames.join(
                    ", "
                  )}
                </p>
              ) : null}
            </DetailAccordionSection>

            <DetailAccordionSection
              id="reverse-engineering-detail-structure"
              isOpen={openDetailSections.has("structure")}
              meta={`연결 ${connectionCount}개`}
              onToggle={() => toggleDetailSection("structure")}
              title="연결과 구조"
            >
              <div aria-label="연결과 구조 수치" className={styles.summaryStats}>
                <span>
                  보드 연결
                  <strong>{connectionCount}</strong>
                </span>
                <span>
                  발견한 관계
                  <strong>{discoveredRelationshipCount}</strong>
                </span>
                <span>
                  연결된 리소스
                  <strong>
                    {
                      result.discoveredResources.filter(
                        (resource) => (resource.relationships?.length ?? 0) > 0
                      ).length
                    }
                  </strong>
                </span>
                <span>
                  보드 표시 전용
                  <strong>{summary.reviewOnlyCount}</strong>
                </span>
              </div>
              <p className={styles.hint}>
                리소스별 연결 관계는 각 리소스를 열어 확인할 수 있습니다. 자동 정리는 구조 의미나
                실제 AWS 소속을 바꾸지 않습니다.
              </p>
            </DetailAccordionSection>

            <DetailAccordionSection
              id="reverse-engineering-detail-read-scope"
              isOpen={openDetailSections.has("read-scope")}
              meta={hasPartialFailure ? "부분 읽기" : "전체 읽기"}
              onToggle={() => toggleDetailSection("read-scope")}
              title="AWS 읽기 범위"
            >
              <ReverseEngineeringScanCoveragePanel
                coverage={result.coverage}
                scanErrors={result.scanErrors}
              />
            </DetailAccordionSection>

            <DetailAccordionSection
              id="reverse-engineering-detail-checks"
              isOpen={openDetailSections.has("checks")}
              meta={`확인 ${result.findings.length + result.analysisExclusions.length}건`}
              onToggle={() => toggleDetailSection("checks")}
              title="확인 사항"
            >
              {summary.reviewOnlyCount > 0 ? (
                <p className={styles.warning}>
                  보드에서만 확인하거나 설정 보완이 필요한 리소스가 {summary.reviewOnlyCount}개 있습니다.
                </p>
              ) : null}
              <ReverseEngineeringFindingsPanel
                analysisExclusions={result.analysisExclusions}
                findings={result.findings}
                resources={result.discoveredResources}
              />
            </DetailAccordionSection>

            <DetailAccordionSection
              id="reverse-engineering-detail-source"
              isOpen={openDetailSections.has("source")}
              meta={`${response.scan.provider.toUpperCase()} · ${response.scan.region}`}
              onToggle={() => toggleDetailSection("source")}
              title="원본 정보"
            >
              <dl className={styles.detailKeyValueList}>
                <div>
                  <dt>클라우드</dt>
                  <dd>{response.scan.provider.toUpperCase()}</dd>
                </div>
                <div>
                  <dt>스캔 리전</dt>
                  <dd>{response.scan.region}</dd>
                </div>
                <div>
                  <dt>원본 리소스</dt>
                  <dd>{summary.discoveredCount}개</dd>
                </div>
                <div>
                  <dt>원본 연결</dt>
                  <dd>{connectionCount}개</dd>
                </div>
              </dl>
              <p className={styles.hint}>
                이름, AWS 원본 종류, 리전, 관계는 가져온 결과에 보존합니다. 팔레트 아이콘으로 보기
                좋게 표시해도 실제 AWS 상태나 원본 종류는 바꾸지 않습니다.
              </p>
            </DetailAccordionSection>
          </div>
        </section>
      </div>
    </>
  );
}

type DetailAccordionSectionProps = {
  readonly children: ReactNode;
  readonly headingLevel?: 3 | 4;
  readonly id: string;
  readonly isOpen: boolean;
  readonly meta?: ReactNode | undefined;
  readonly onToggle: () => void;
  readonly title: string;
};

function DetailAccordionSection({
  children,
  headingLevel = 3,
  id,
  isOpen,
  meta,
  onToggle,
  title
}: DetailAccordionSectionProps) {
  const Heading = headingLevel === 4 ? "h4" : "h3";

  return (
    <section className={styles.detailAccordion}>
      <Heading className={styles.detailAccordionHeading}>
        <button
          aria-controls={`${id}-content`}
          aria-expanded={isOpen}
          className={styles.detailAccordionTrigger}
          data-open={isOpen}
          id={`${id}-trigger`}
          onClick={onToggle}
          type="button"
        >
          <span className={styles.detailAccordionTitle}>{title}</span>
          {meta ? <span className={styles.detailAccordionMeta}>{meta}</span> : null}
        </button>
      </Heading>
      {isOpen ? (
        <div
          aria-labelledby={`${id}-trigger`}
          className={styles.detailAccordionBody}
          id={`${id}-content`}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

function ResourceCategoryAccordion({
  group,
  isOpen,
  onResourceToggle,
  onToggle,
  openResourceIds,
  resourceDisplayNames,
  resourceWarningsById,
  visibleResources
}: {
  readonly group: ReverseEngineeringResourceCategoryGroup;
  readonly isOpen: boolean;
  readonly onResourceToggle: (resourceId: string) => void;
  readonly onToggle: () => void;
  readonly openResourceIds: ReadonlySet<string>;
  readonly resourceDisplayNames: ReadonlyMap<string, string>;
  readonly resourceWarningsById: ReadonlyMap<string, readonly string[]>;
  readonly visibleResources: readonly DiscoveredResource[];
}) {
  return (
    <DetailAccordionSection
      headingLevel={4}
      id={`reverse-engineering-category-${group.key}`}
      isOpen={isOpen}
      meta={
        <span className={styles.resourceCategoryMeta}>
          <span>전체 {group.resources.length}</span>
          <span className={styles.supportedBadge}>지원 {group.supportedCount}</span>
          <span className={styles.reviewOnlyBadge}>추가 확인 {group.reviewOnlyCount}</span>
          {group.unreadableServiceCount > 0 ? (
            <span className={styles.errorBadge}>읽기 실패 {group.unreadableServiceCount}</span>
          ) : null}
        </span>
      }
      onToggle={onToggle}
      title={group.label}
    >
      {group.unreadableServiceCount > 0 ? (
        <p className={styles.warning}>
          읽지 못한 AWS 서비스: {group.unreadableServiceNames.join(", ")}
        </p>
      ) : null}
      {visibleResources.length === 0 ? (
        <p className={styles.hint}>
          {group.resources.length === 0 ? "가져온 리소스가 없습니다." : "검색 결과가 없습니다."}
        </p>
      ) : (
        <div className={styles.resourceAccordions}>
          {visibleResources.map((resource) => (
            <DiscoveredResourceAccordion
              isOpen={openResourceIds.has(resource.id)}
              key={resource.id}
              onToggle={() => onResourceToggle(resource.id)}
              resource={resource}
              resourceDisplayNames={resourceDisplayNames}
              warnings={resourceWarningsById.get(resource.id) ?? []}
            />
          ))}
        </div>
      )}
    </DetailAccordionSection>
  );
}

function DiscoveredResourceAccordion({
  isOpen,
  onToggle,
  resource,
  resourceDisplayNames,
  warnings
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly resource: DiscoveredResource;
  readonly resourceDisplayNames: ReadonlyMap<string, string>;
  readonly warnings: readonly string[];
}) {
  const presentation = presentReverseEngineeringResource(resource);
  const coreValues = getReverseEngineeringInspectorCoreValues(resource.resourceType, resource.config);
  const isSupported = presentation.displayState === "supported";
  const relationships = resource.relationships ?? [];

  return (
    <article className={styles.resourceAccordion}>
      <h5 className={styles.resourceAccordionHeading}>
        <button
          aria-controls={`reverse-engineering-resource-${resource.id}-content`}
          aria-expanded={isOpen}
          className={styles.resourceAccordionTrigger}
          data-open={isOpen}
          id={`reverse-engineering-resource-${resource.id}-trigger`}
          onClick={onToggle}
          type="button"
        >
          <span className={styles.resourceAccordionTitle}>
            <strong>{presentation.displayName}</strong>
            <span>{presentation.serviceLabel}</span>
          </span>
          <span className={isSupported ? styles.supportedBadge : styles.reviewOnlyBadge}>
            {isSupported ? "지원됨" : "추가 확인"}
          </span>
        </button>
      </h5>
      {isOpen ? (
        <div
          aria-labelledby={`reverse-engineering-resource-${resource.id}-trigger`}
          className={styles.resourceAccordionBody}
          id={`reverse-engineering-resource-${resource.id}-content`}
        >
          <section className={styles.resourceDetailSection}>
            <h6>기본 정보</h6>
            <dl className={styles.detailKeyValueList}>
              <div>
                <dt>이름</dt>
                <dd>{presentation.displayName}</dd>
              </div>
              <div>
                <dt>AWS 서비스</dt>
                <dd>{presentation.serviceLabel}</dd>
              </div>
              <div>
                <dt>표시 상태</dt>
                <dd>{isSupported ? "지원됨" : "추가 확인"}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.resourceDetailSection}>
            <h6>AWS 원본 정보</h6>
            <dl className={styles.detailKeyValueList}>
              <div>
                <dt>원본 종류</dt>
                <dd>{getReverseEngineeringProviderTypeLabel(resource.providerResourceType)}</dd>
              </div>
              <div>
                <dt>원본 종류 식별자</dt>
                <dd>
                  <code>{resource.providerResourceType}</code>
                </dd>
              </div>
              <div>
                <dt>리전</dt>
                <dd>{resource.region}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.resourceDetailSection}>
            <h6>연결</h6>
            {relationships.length === 0 ? (
              <p className={styles.hint}>가져온 연결 관계가 없습니다.</p>
            ) : (
              <ul className={styles.resultList}>
                {relationships.map((relationship, index) => (
                  <li
                    className={styles.resultItem}
                    key={`${relationship.targetResourceId}-${relationship.type}-${index}`}
                  >
                    <strong>
                      {resourceDisplayNames.get(relationship.targetResourceId) ?? "연결된 AWS 리소스"}
                    </strong>
                    <span>
                      {relationship.label?.trim() || formatDiscoveredResourceRelationship(relationship.type)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.resourceDetailSection}>
            <h6>설정</h6>
            {coreValues.length === 0 ? (
              <p className={styles.hint}>화면에 안전하게 표시할 핵심 설정이 없습니다.</p>
            ) : (
              <dl className={styles.detailKeyValueList}>
                {coreValues.map((value) => (
                  <div key={value.key}>
                    <dt>{value.label}</dt>
                    <dd>{value.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className={styles.resourceDetailSection}>
            <h6>주의 사항</h6>
            {warnings.length === 0 && isSupported ? (
              <p className={styles.hint}>추가 주의 사항이 없습니다.</p>
            ) : (
              <ul className={styles.resultList}>
                {!isSupported ? (
                  <li className={styles.resultItem}>
                    <span>{presentation.statusDescription}</span>
                  </li>
                ) : null}
                {warnings.map((warning) => (
                  <li className={styles.resultItem} key={warning}>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </article>
  );
}

function createResourceWarningsById(input: {
  readonly analysisExclusions: readonly { readonly message: string; readonly resourceId: string }[];
  readonly findings: readonly {
    readonly description: string;
    readonly resourceId?: string | null | undefined;
    readonly title: string;
  }[];
}): ReadonlyMap<string, readonly string[]> {
  const warningsByResourceId = new Map<string, string[]>();

  function add(resourceId: string, warning: string): void {
    const normalizedWarning = warning.trim();

    if (!normalizedWarning) {
      return;
    }

    const current = warningsByResourceId.get(resourceId) ?? [];
    if (!current.includes(normalizedWarning)) {
      current.push(normalizedWarning);
      warningsByResourceId.set(resourceId, current);
    }
  }

  for (const exclusion of input.analysisExclusions) {
    add(exclusion.resourceId, exclusion.message);
  }

  for (const finding of input.findings) {
    if (finding.resourceId) {
      add(finding.resourceId, `${finding.title}: ${finding.description}`);
    }
  }

  return warningsByResourceId;
}

function formatDiscoveredResourceRelationship(relationshipType: string): string {
  if (relationshipType === "contains") {
    return "포함 관계";
  }

  if (relationshipType === "depends_on") {
    return "의존 관계";
  }

  return "연결 관계";
}

function toggleAccordionSet<T>(current: ReadonlySet<T>, key: T): ReadonlySet<T> {
  const next = new Set(current);

  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }

  return next;
}

function getReverseEngineeringScanStatusLabel(
  status: ReverseEngineeringScanResponse["scan"]["status"],
  coverage: ReverseEngineeringServiceCoverage | undefined
): string {
  if (status === "completed") {
    return coverage?.status === "partial" ? "부분 성공" : "완료";
  }

  if (status === "failed") {
    return "실패";
  }

  if (status === "cancelled") {
    return "취소됨";
  }

  return status === "running" ? "진행 중" : "대기 중";
}

function formatReverseEngineeringScanTime(scan: ReverseEngineeringScanResponse["scan"]): string {
  const finishedAt = scan.completedAt ?? scan.updatedAt ?? scan.createdAt;
  const date = new Date(finishedAt);

  if (Number.isNaN(date.getTime())) {
    return "시간 정보 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(date);
}

// 사용자가 적용하기 전에 이번 스캔이 전체 결과인지 부분 결과인지 먼저 알려줍니다.
export function ReverseEngineeringScanCoveragePanel({
  coverage,
  scanErrors
}: {
  readonly coverage?: ReverseEngineeringServiceCoverage | undefined;
  readonly scanErrors: ReverseEngineeringScanError[];
}) {
  const notice = getScanCoverageNotice(coverage, scanErrors);
  const hasPartialFailure = coverage
    ? coverage.status === "partial"
    : scanErrors.some((scanError) => scanError.reason !== "unsupported");
  const capabilityLimits = coverage?.capabilityLimits ?? [];
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
          remedy: getCoverageRemedy(service.reason),
          affectedProviderResourceTypes:
            service.affectedProviderResourceTypes ??
            detailedPresentation?.affectedProviderResourceTypes ??
            [],
          failedAwsApiActions: getSafeFailedAwsApiActions(
            [
              ...(service.failedAwsApiActions ?? []),
              ...(detailedPresentation?.failedAwsApiActions ?? [])
            ]
          )
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
                  {(presentation.affectedProviderResourceTypes?.length ?? 0) > 0 ? (
                    <span>
                      읽지 못한 종류: {presentation.affectedProviderResourceTypes?.join(", ")}
                    </span>
                  ) : null}
                  {(presentation.failedAwsApiActions?.length ?? 0) > 0 ? (
                    <>
                      <span>필요한 읽기 권한: {presentation.failedAwsApiActions?.join(", ")}</span>
                      <span>표시된 API 동작의 읽기 권한을 추가한 뒤 다시 시도해 주세요.</span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
      {capabilityLimits.length > 0 ? (
        <details className={styles.detail}>
          <summary className={styles.detailSummary}>Cloud Control 목록 조회 미지원 종류</summary>
          <div className={styles.detailBody}>
            <ul className={styles.resultList}>
              {capabilityLimits.map((capabilityLimit) => (
                <li key={capabilityLimit.serviceKey} className={styles.resultItem}>
                  <strong>{capabilityLimit.displayName}</strong>
                  <span className={styles.errorBadge}>목록 조회 미지원</span>
                  <span>이 종류는 별도 reader가 필요합니다.</span>
                  {(capabilityLimit.affectedProviderResourceTypes?.length ?? 0) > 0 ? (
                    <span>
                      해당 종류: {capabilityLimit.affectedProviderResourceTypes?.join(", ")}
                    </span>
                  ) : null}
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

  if (
    coverage?.status === "partial" ||
    scanErrors.some((scanError) => scanError.reason !== "unsupported")
  ) {
    return "일부 AWS 서비스를 읽지 못했습니다. 가져온 결과가 전체 AWS 상태가 아닐 수 있습니다.";
  }

  if ((coverage?.capabilityLimits?.length ?? 0) > 0) {
    return "읽기 실패는 없지만 일부 AWS 종류는 Cloud Control 목록 조회 대신 별도 reader가 필요합니다.";
  }

  return "현재 권한으로 읽을 수 있는 범위에서는 부분 실패 없이 스캔했습니다.";
}

// gg: 공개 coverage의 실제 읽기 실패 원인만 사용자가 바로 할 수 있는 짧은 문장으로 바꿉니다.
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

// 오래 저장된 결과도 오류 원문이나 식별자를 다시 화면에 내보내지 않습니다.
function getSafeFailedAwsApiActions(actions: readonly string[]): readonly string[] {
  return [
    ...new Set(
      actions.filter(
        (action) =>
          /^[a-z0-9][a-z0-9-]{0,63}:[A-Za-z][A-Za-z0-9]{0,127}$/u.test(action) &&
          SAFE_REVERSE_ENGINEERING_READ_ACTION_PREFIXES.some((servicePrefix) =>
            action.startsWith(`${servicePrefix}:`)
          )
      )
    )
  ].sort();
}

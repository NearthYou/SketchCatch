"use client";

import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type {
  DiscoveredResource,
  ReverseEngineeringScanResponse
} from "../../../../packages/types/src";
import { setupModalAccessibility } from "../../components/ui/modal-accessibility";
import {
  buildReverseEngineeringResourceAccordionModel,
  getReverseEngineeringCategoryReadStatusLabel,
  getSearchExpandedReverseEngineeringResourceCategories,
  type ReverseEngineeringResourceCategoryGroup,
  type ReverseEngineeringResourceCategoryKey
} from "./reverse-engineering-detail-model";
import {
  getReverseEngineeringProviderTypeLabel,
  presentReverseEngineeringResource,
  presentReverseEngineeringScanErrors,
  summarizeReverseEngineeringScan
} from "./reverse-engineering-presentation";
import { getReverseEngineeringPartialScanNotice } from "./reverse-engineering-scan-notice";
import styles from "./reverse-engineering.module.css";

type ReverseEngineeringDetailsDialogProps = {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly settingsHref: string;
  readonly response: ReverseEngineeringScanResponse;
};

type DetailSection = "resources" | "coverage" | "checks" | "source";

/** 상세 창은 보드 미리보기를 건드리지 않고 AWS 발견 결과만 탐색하게 합니다. */
export function ReverseEngineeringDetailsDialog({
  isOpen,
  onClose,
  response,
  settingsHref
}: ReverseEngineeringDetailsDialogProps) {
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<ReadonlySet<DetailSection>>(
    () => new Set()
  );
  const [openCategories, setOpenCategories] = useState<ReadonlySet<ReverseEngineeringResourceCategoryKey>>(
    () => new Set()
  );
  const [openResourceIds, setOpenResourceIds] = useState<ReadonlySet<string>>(() => new Set());
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const result = response.result;

  // 부모가 다시 렌더되어도 열린 Modal의 접근성 effect가 다시 시작하지 않도록 최신 닫기 행동만 ref에 둡니다.
  onCloseRef.current = onClose;

  // Modal 안의 모든 닫기 행동은 항상 최신 부모 callback으로만 전달합니다.
  const closeDialog = useCallback((): void => {
    onCloseRef.current();
  }, []);

  // Modal 공통 도우미가 포커스·Escape·배경 스크롤과 닫은 뒤 포커스 복귀를 처리합니다.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    const closeButton = closeButtonRef.current;
    if (!overlay || !dialog || !closeButton) {
      return;
    }

    return setupModalAccessibility({
      closeButton,
      dialog,
      documentRoot: document,
      onClose: closeDialog,
      overlay
    });
  }, [closeDialog, isOpen]);

  // 결과가 없는 실행 중/실패 상태에는 상세 창을 만들지 않습니다.
  if (!isOpen || !result || typeof document === "undefined") {
    return null;
  }

  const summary = summarizeReverseEngineeringScan(result);
  const resourceModel = buildReverseEngineeringResourceAccordionModel({
    coverage: result.coverage,
    resources: result.discoveredResources,
    scanErrors: result.scanErrors,
    search
  });
  const searchOpenCategories = getSearchExpandedReverseEngineeringResourceCategories(resourceModel);
  const isSearching = resourceModel.normalizedSearch.length > 0;
  const displayNames = new Map(
    result.discoveredResources.map((resource) => [
      resource.id,
      presentReverseEngineeringResource(resource).displayName
    ])
  );
  const safeScanErrors = presentReverseEngineeringScanErrors(result.scanErrors);
  const unreadableServices = result.coverage?.unavailableServices ?? [];
  const capabilityLimits = result.coverage?.capabilityLimits ?? [];
  const hasPartialFailure =
    result.coverage?.status === "partial" ||
    result.scanErrors.some((scanError) => scanError.reason !== "unsupported");
  const partialScanNotice = getReverseEngineeringPartialScanNotice(result);

  // 배경을 직접 누른 경우에만 dialog를 닫아 내부 선택을 지킵니다.
  function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  }

  // 검색 중에는 결과가 있는 분류를 자동으로 열고, 평소에는 사용자가 직접 열게 합니다.
  function isCategoryOpen(categoryKey: ReverseEngineeringResourceCategoryKey): boolean {
    return isSearching ? searchOpenCategories.has(categoryKey) : openCategories.has(categoryKey);
  }

  // 상세 분류의 접힘 상태를 독립적으로 전환합니다.
  function toggleSection(section: DetailSection): void {
    setOpenSections((current) => toggleSetValue(current, section));
  }

  // 리소스 검색이 아닐 때만 사용자의 분류 접힘 상태를 바꿉니다.
  function toggleCategory(categoryKey: ReverseEngineeringResourceCategoryKey): void {
    if (!isSearching) {
      setOpenCategories((current) => toggleSetValue(current, categoryKey));
    }
  }

  // 개별 리소스의 원본 정보는 필요할 때만 펼칩니다.
  function toggleResource(resourceId: string): void {
    setOpenResourceIds((current) => toggleSetValue(current, resourceId));
  }

  const dialog = (
    <div
      className={styles.modalBackdrop}
      onMouseDown={handleBackdropMouseDown}
      ref={overlayRef}
    >
      <section
        aria-describedby="reverse-engineering-details-description"
        aria-labelledby="reverse-engineering-details-title"
        aria-modal="true"
        className={styles.modalDialog}
        ref={dialogRef}
        role="dialog"
      >
        <header className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>Reverse Engineering</span>
            <h2 id="reverse-engineering-details-title">상세 정보</h2>
            <p id="reverse-engineering-details-description">
              가져온 구조, 읽기 제한, 확인이 필요한 항목을 나누어 봅니다.
            </p>
          </div>
          <button
            aria-label="상세 정보 닫기"
            className={styles.iconButton}
            onClick={closeDialog}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className={styles.modalBody}>
          <section aria-label="가져오기 요약">
            <div className={styles.categoryGrid}>
              {resourceModel.groups.map((group) => (
                <article className={styles.categoryCard} key={group.key}>
                  <span>{group.label}</span>
                  <strong>{group.resources.length}</strong>
                  <small>
                    지원 {group.supportedCount} · 확인 {group.reviewOnlyCount} · {getReverseEngineeringCategoryReadStatusLabel(group.unreadableServiceCount)}
                  </small>
                </article>
              ))}
            </div>
            <p className={styles.hint}>
              리소스 {summary.discoveredCount}개 · 연결 {result.architectureJson.edges.length}개 · 보드 표시 {summary.boardCount}개
            </p>
          </section>

          <DetailAccordion
            isOpen={openSections.has("resources") || isSearching}
            meta={`리소스 ${summary.discoveredCount}개`}
            onToggle={() => {
              if (!isSearching) {
                toggleSection("resources");
              }
            }}
            sectionId="resources"
            title="가져온 리소스"
          >
            <label className={styles.searchField}>
              <Search aria-hidden="true" size={16} />
              <span>검색</span>
              <input
                aria-label="리소스 이름 또는 종류 검색"
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="리소스 이름 또는 종류 검색"
                type="search"
                value={search}
              />
            </label>
            <p className={styles.hint}>
              {isSearching
                ? "검색 결과가 있는 카테고리만 펼쳐서 보여 줍니다."
                : "카테고리를 열어 이름, AWS 서비스, 원본 종류와 연결을 확인하세요."}
            </p>
            <div className={styles.resourceList}>
              {resourceModel.groups.map((group) => (
                <ResourceCategory
                  displayNames={displayNames}
                  group={group}
                  isOpen={isCategoryOpen(group.key)}
                  key={group.key}
                  onResourceToggle={toggleResource}
                  onToggle={() => toggleCategory(group.key)}
                  openResourceIds={openResourceIds}
                  resources={isSearching ? group.matchingResources : group.resources}
                />
              ))}
            </div>
          </DetailAccordion>

          <DetailAccordion
            isOpen={openSections.has("coverage")}
            meta={hasPartialFailure ? "부분 읽기" : "읽기 완료"}
            onToggle={() => toggleSection("coverage")}
            sectionId="coverage"
            title="읽기 실패 또는 제한"
          >
            {hasPartialFailure ? (
              <div className={styles.warningNotice} role="status">
                <strong>읽은 리소스는 미리보기에 유지합니다.</strong>
                <p>읽지 못한 서비스만 따로 표시하며, 전체 실패처럼 취급하지 않습니다.</p>
                {partialScanNotice?.action === "open_settings" ? (
                  <a className={styles.secondaryButton} href={settingsHref}>
                    환경설정에서 권한 확인
                  </a>
                ) : null}
              </div>
            ) : null}
            {unreadableServices.length === 0 && safeScanErrors.length === 0 && capabilityLimits.length === 0 ? (
              <p className={styles.emptyMessage}>읽기 실패나 알려진 조회 제한이 없습니다.</p>
            ) : null}
            {unreadableServices.length > 0 ? (
              <ul className={styles.simpleList}>
                {unreadableServices.map((service) => (
                  <li key={`${service.serviceKey}-${service.reason}`}>
                    <strong>{service.displayName}</strong>
                    <span>{formatCoverageReason(service.reason)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {safeScanErrors.length > 0 ? (
              <ul className={styles.simpleList}>
                {safeScanErrors.map((scanError) => (
                  <li key={scanError.key}>
                    <strong>{scanError.serviceName}</strong>
                    <span>{scanError.causeLabel} · {scanError.remedy}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {capabilityLimits.length > 0 ? (
              <ul className={styles.simpleList}>
                {capabilityLimits.map((limit) => (
                  <li key={`${limit.serviceKey}-${limit.reason}`}>
                    <strong>{limit.displayName}</strong>
                    <span>AWS의 현재 목록 조회 방식에서 지원하지 않는 종류입니다.</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </DetailAccordion>

          <DetailAccordion
            isOpen={openSections.has("checks")}
            meta={`확인 ${result.findings.length + result.analysisExclusions.length}건`}
            onToggle={() => toggleSection("checks")}
            sectionId="checks"
            title="확인 필요 사항"
          >
            {result.findings.length === 0 && result.analysisExclusions.length === 0 ? (
              <p className={styles.emptyMessage}>현재 스캔 결과에서 추가 확인 사항이 없습니다.</p>
            ) : null}
            {result.findings.length > 0 ? (
              <ul className={styles.simpleList}>
                {result.findings.map((finding) => (
                  <li key={finding.id}>
                    <strong>{finding.title}</strong>
                    <span>{finding.description}</span>
                    <span>권장: {finding.recommendation}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {result.analysisExclusions.length > 0 ? (
              <ul className={styles.simpleList}>
                {result.analysisExclusions.map((exclusion) => (
                  <li key={exclusion.id}>
                    <strong>{displayNames.get(exclusion.resourceId) ?? "확인 필요 리소스"}</strong>
                    <span>{exclusion.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </DetailAccordion>

          <DetailAccordion
            isOpen={openSections.has("source")}
            meta={`${response.scan.provider.toUpperCase()} · ${response.scan.region}`}
            onToggle={() => toggleSection("source")}
            sectionId="source"
            title="원본 정보"
          >
            <dl className={styles.keyValues}>
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
                <dd>{result.architectureJson.edges.length}개</dd>
              </div>
            </dl>
            <p className={styles.hint}>
              AWS 이름, 종류, 관계, 리전과 원본 provider type은 그대로 보존합니다. 아이콘은 보기 쉬운 팔레트 타입으로만 표시합니다.
            </p>
          </DetailAccordion>
        </div>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}

/** 접힌 상세 영역의 공통 제목·상태·본문을 제공합니다. */
function DetailAccordion({
  children,
  isOpen,
  meta,
  onToggle,
  sectionId,
  title
}: {
  readonly children: ReactNode;
  readonly isOpen: boolean;
  readonly meta: string;
  readonly onToggle: () => void;
  readonly sectionId: DetailSection;
  readonly title: string;
}) {
  const contentId = `reverse-engineering-detail-${sectionId}`;

  return (
    <section className={styles.detailAccordion}>
      <h3>
        <button
          aria-controls={contentId}
          aria-expanded={isOpen}
          className={styles.accordionTrigger}
          data-open={isOpen}
          onClick={onToggle}
          type="button"
        >
          <span className={styles.accordionTitle}>{title}</span>
          <span className={styles.accordionMeta}>{meta}</span>
          {isOpen ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
        </button>
      </h3>
      {isOpen ? <div className={styles.accordionBody} id={contentId}>{children}</div> : null}
    </section>
  );
}

/** 카테고리는 검색 상태와 별개로 기본적으로 접혀 있고, 항목 요약을 먼저 보여 줍니다. */
function ResourceCategory({
  displayNames,
  group,
  isOpen,
  onResourceToggle,
  onToggle,
  openResourceIds,
  resources
}: {
  readonly displayNames: ReadonlyMap<string, string>;
  readonly group: ReverseEngineeringResourceCategoryGroup;
  readonly isOpen: boolean;
  readonly onResourceToggle: (resourceId: string) => void;
  readonly onToggle: () => void;
  readonly openResourceIds: ReadonlySet<string>;
  readonly resources: readonly DiscoveredResource[];
}) {
  const contentId = `reverse-engineering-category-${group.key}`;

  return (
    <section className={styles.resourceCategory}>
      <h4>
        <button
          aria-controls={contentId}
          aria-expanded={isOpen}
          className={styles.accordionTrigger}
          data-open={isOpen}
          onClick={onToggle}
          type="button"
        >
          <span className={styles.accordionTitle}>{group.label}</span>
          <span className={styles.categoryMeta}>
            <span className={styles.countBadge}>전체 {group.resources.length}</span>
            <span className={styles.supportBadge}>지원 {group.supportedCount}</span>
            {group.reviewOnlyCount > 0 ? <span className={styles.reviewBadge}>확인 {group.reviewOnlyCount}</span> : null}
            {group.unreadableServiceCount > 0 ? <span className={styles.failureBadge}>읽기 실패 {group.unreadableServiceCount}</span> : null}
          </span>
          {isOpen ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
        </button>
      </h4>
      {isOpen ? (
        <div className={styles.resourceCategoryBody} id={contentId}>
          {group.unreadableServiceCount > 0 ? (
            <p className={styles.warningNotice}>
              읽지 못한 AWS 서비스: {group.unreadableServiceNames.join(", ")}
            </p>
          ) : null}
          {resources.length === 0 ? (
            <p className={styles.emptyMessage}>
              {group.resources.length === 0 ? "가져온 리소스가 없습니다." : "검색 결과가 없습니다."}
            </p>
          ) : (
            resources.map((resource) => (
              <ResourceItem
                displayNames={displayNames}
                isOpen={openResourceIds.has(resource.id)}
                key={resource.id}
                onToggle={() => onResourceToggle(resource.id)}
                resource={resource}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

/** 개별 리소스는 사람이 읽는 정보부터 보여 주고 기술 원본은 필요할 때만 숨김 해제합니다. */
function ResourceItem({
  displayNames,
  isOpen,
  onToggle,
  resource
}: {
  readonly displayNames: ReadonlyMap<string, string>;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly resource: DiscoveredResource;
}) {
  const presentation = presentReverseEngineeringResource(resource);
  const relationships = resource.relationships ?? [];
  const contentId = `reverse-engineering-resource-${toStableId(resource.id)}`;

  return (
    <article className={styles.resourceItem}>
      <h5>
        <button
          aria-controls={contentId}
          aria-expanded={isOpen}
          className={styles.resourceTrigger}
          data-open={isOpen}
          onClick={onToggle}
          type="button"
        >
          <span className={styles.resourceTitle}>
            <strong>{presentation.displayName}</strong>
            <span>{presentation.serviceLabel}</span>
          </span>
          <span className={presentation.displayState === "supported" ? styles.supportBadge : styles.reviewBadge}>
            {presentation.displayState === "supported" ? "지원됨" : "확인 필요"}
          </span>
          {isOpen ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
        </button>
      </h5>
      {isOpen ? (
        <div className={styles.resourceBody} id={contentId}>
          <dl className={styles.keyValues}>
            <div>
              <dt>AWS 서비스</dt>
              <dd>{presentation.serviceLabel}</dd>
            </div>
            <div>
              <dt>원본 종류</dt>
              <dd>{getReverseEngineeringProviderTypeLabel(resource.providerResourceType)}</dd>
            </div>
            <div>
              <dt>리전</dt>
              <dd>{resource.region}</dd>
            </div>
            <div>
              <dt>표시 상태</dt>
              <dd>{presentation.statusLabel}</dd>
            </div>
          </dl>
          <p className={styles.hint}>{presentation.statusDescription}</p>
          <section>
            <strong>연결</strong>
            {relationships.length === 0 ? (
              <p className={styles.hint}>가져온 연결 관계가 없습니다.</p>
            ) : (
              <ul className={styles.relationList}>
                {relationships.map((relationship, index) => (
                  <li key={`${relationship.targetResourceId}-${relationship.type}-${index}`}>
                    {formatRelationship(relationship.type)} · {displayNames.get(relationship.targetResourceId) ?? "연결된 AWS 리소스"}
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

/** Set 기반 접힘 상태를 불변으로 바꿉니다. */
function toggleSetValue<T>(current: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

/** DOM id에 쓸 수 있게 제목·리소스 id를 짧은 안전한 값으로 바꿉니다. */
function toStableId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/gu, "-");
}

/** 관계 코드를 사람에게 먼저 이해되는 문장으로 바꿉니다. */
function formatRelationship(
  value: NonNullable<DiscoveredResource["relationships"]>[number]["type"]
): string {
  if (value === "contains") {
    return "포함";
  }
  if (value === "depends_on") {
    return "의존";
  }
  return "연결";
}


/** coverage 응답의 복구 방향을 원문 코드 없이 설명합니다. */
function formatCoverageReason(reason: "permission_required" | "not_configured" | "retry"): string {
  if (reason === "permission_required") {
    return "필요한 읽기 권한을 확인해 주세요.";
  }
  if (reason === "not_configured") {
    return "AWS 연결 설정을 확인해 주세요.";
  }
  return "잠시 후 다시 시도해 주세요.";
}

"use client";

import { CheckCircle2, LoaderCircle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode, ReactPortal } from "react";
import type {
  AwsConnection,
  ReverseEngineeringResourceSelection
} from "../../../../packages/types/src";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { ReverseEngineeringDetailsDialog } from "./ReverseEngineeringDetailsDialog";
import {
  isReverseEngineeringResourceSelectionChecked,
  REVERSE_ENGINEERING_RESOURCE_SELECTIONS
} from "./reverse-engineering-resource-types";
import { getReverseEngineeringPartialScanNotice } from "./reverse-engineering-scan-notice";
import { useReverseEngineeringWorkflow } from "./useReverseEngineeringWorkflow";
import { setupModalAccessibility } from "../../components/ui/modal-accessibility";
import styles from "./reverse-engineering.module.css";

type ReverseEngineeringPanelProps = {
  readonly context: DiagramEditorPanelContext;
  readonly createProjectOnApply?: boolean | undefined;
  readonly onStatusChange?: ((status: string) => void) | undefined;
  readonly projectId: string;
  readonly projectName: string;
};

type ReverseEngineeringWorkflow = ReturnType<typeof useReverseEngineeringWorkflow>;

const PRIMARY_RESOURCE_SELECTIONS = ["ALL", "VPC", "EC2", "RDS", "S3"] as const;
/** RE 화면의 한 hook 상태를 가운데 시작 상태·오른쪽 행동에 함께 연결합니다. */
export function ReverseEngineeringPanel(props: ReverseEngineeringPanelProps) {
  const workflow = useReverseEngineeringWorkflow(props);
  const [areSlotsReady, setSlotsReady] = useState(false);
  const [isDetailsOpen, setDetailsOpen] = useState(false);
  const [isApplyConfirmationOpen, setApplyConfirmationOpen] = useState(false);
  const selectedResponse = workflow.selectedCandidateResponse;
  const result = selectedResponse?.result ?? null;
  const status = getReverseEngineeringWorkspaceStatus({
    hasPreview: Boolean(result),
    isScanning: workflow.scanState === "loading",
    scanFailed: Boolean(workflow.scanFailure),
    canApply: workflow.canApply
  });

  // 상세 창을 닫는 callback identity를 안정화해 선택 상태가 바뀌어도 focus trap을 다시 만들지 않습니다.
  const closeDetails = useCallback(() => {
    setDetailsOpen(false);
  }, []);

  // 상세 창 열기도 같은 callback으로 유지해 보조 패널의 버튼 상태를 예측 가능하게 만듭니다.
  const openDetails = useCallback(() => {
    setDetailsOpen(true);
  }, []);

  // 기존 보드 적용 확인 창을 취소할 때만 닫아 저장 요청과 섞이지 않게 합니다.
  const closeApplyConfirmation = useCallback(() => {
    setApplyConfirmationOpen(false);
  }, []);

  // DiagramEditor가 만든 가운데 slot을 client mount 뒤에 찾아 같은 workflow state를 렌더합니다.
  useEffect(() => {
    setSlotsReady(true);
  }, []);

  // Workspace 상단 바에 scan 전·중·미리보기 상태를 짧게 반영합니다.
  useEffect(() => {
    props.onStatusChange?.(status);
  }, [props.onStatusChange, status]);

  // slot이 없어도 오른쪽 패널 기능은 정상 동작하게 가운데 시작 portal만 조건부로 만듭니다.
  const startCardPortal = areSlotsReady && !result
    ? createReverseEngineeringPortal(
        <ReverseEngineeringStartState workflow={workflow} />,
        "reverse-engineering-empty-slot"
      )
    : null;

  // 새 프로젝트는 사용자의 보드 적용 클릭 자체가 생성 확인이며, 기존 프로젝트만 교체/추가 확인을 한 번 더 받습니다.
  function requestApply(): void {
    if (!workflow.canApply) {
      return;
    }

    if (props.createProjectOnApply) {
      void workflow.applyScanResult(workflow.applicationMode);
      return;
    }

    setApplyConfirmationOpen(true);
  }

  // 기존 프로젝트의 실제 저장 호출은 확인 Modal에서만 수행합니다.
  function confirmApply(): void {
    closeApplyConfirmation();
    void workflow.applyScanResult(workflow.applicationMode);
  }

  return (
    <>
      {startCardPortal}
      <ReverseEngineeringRightPanel
        createProjectOnApply={props.createProjectOnApply ?? false}
        isDetailsOpen={isDetailsOpen}
        onOpenDetails={openDetails}
        onRequestApply={requestApply}
        workflow={workflow}
      />
      {selectedResponse ? (
        <ReverseEngineeringDetailsDialog
          isOpen={isDetailsOpen}
          onClose={closeDetails}
          response={selectedResponse}
          settingsHref={workflow.resultSettingsHref}
        />
      ) : null}
      <ReverseEngineeringApplyConfirmationDialog
        applicationMode={workflow.applicationMode}
        isOpen={isApplyConfirmationOpen}
        isSaving={workflow.applyState === "saving"}
        onCancel={closeApplyConfirmation}
        onConfirm={confirmApply}
      />
    </>
  );
}

/** 빈 보드 중앙은 AWS 연결 상태에 따라 스캔 시작 또는 설정 복구만 안내합니다. */
function ReverseEngineeringStartState({
  workflow
}: {
  readonly workflow: ReverseEngineeringWorkflow;
}) {
  const recoveryNeeded = workflow.awsConnectionRecovery.readiness !== "ready";
  const isScanning = workflow.scanState === "loading";

  // 빈 보드의 시작 행동은 scan만 요청하며 프로젝트나 보드에는 쓰지 않습니다.
  function handleScanStart(): void {
    void workflow.runScan();
  }

  return (
    <section aria-busy={isScanning} aria-label="기존 AWS 가져오기" className={styles.startCard}>
      <p className={styles.eyebrow}>Reverse Engineering</p>
      <h2>AWS 구조 살펴보기</h2>
      <p>연결된 AWS 환경을 읽어 현재 구조를 한눈에 확인하세요.</p>
      {isScanning ? (
        <div className={styles.scanProgress} role="status">
          <LoaderCircle aria-hidden="true" className={styles.inlineSpinner} size={18} />
          <strong>AWS 구조를 읽는 중입니다.</strong>
          <span>리소스와 연결 관계를 준비하고 있습니다.</span>
        </div>
      ) : recoveryNeeded ? (
        <div className={styles.warningNotice} role="status">
          <strong>{workflow.awsConnectionRecovery.title}</strong>
          <p>{workflow.awsConnectionRecovery.description}</p>
        </div>
      ) : workflow.scanFailure ? (
        <div className={styles.errorNotice} role="alert">
          <strong>{workflow.scanFailure.title}</strong>
          <p>{workflow.scanFailure.description}</p>
        </div>
      ) : null}
      <div className={styles.startCardActions}>
        {recoveryNeeded || workflow.scanFailure?.action === "open_settings" ? (
          <a className={styles.primaryButton} href={workflow.settingsHref}>
            AWS 연결 설정
          </a>
        ) : null}
        <button
          className={recoveryNeeded ? styles.secondaryButton : styles.primaryButton}
          disabled={!workflow.canStartScan || isScanning}
          onClick={handleScanStart}
          type="button"
        >
          {isScanning ? <LoaderCircle aria-hidden="true" className={styles.inlineSpinner} size={16} /> : null}
          {workflow.scanFailure ? "다시 시도" : isScanning ? "AWS 구조를 읽는 중…" : "기존 AWS 가져오기"}
        </button>
      </div>
    </section>
  );
}

/** 오른쪽 패널은 설정과 결과의 핵심 행동만 보여 주고 긴 원본 정보는 Modal로 보냅니다. */
function ReverseEngineeringRightPanel({
  createProjectOnApply,
  isDetailsOpen,
  onOpenDetails,
  onRequestApply,
  workflow
}: {
  readonly createProjectOnApply: boolean;
  readonly isDetailsOpen: boolean;
  readonly onOpenDetails: () => void;
  readonly onRequestApply: () => void;
  readonly workflow: ReverseEngineeringWorkflow;
}) {
  const result = workflow.selectedCandidateResponse?.result ?? null;
  const isScanning = workflow.scanState === "loading";
  const hasRecoveryAction = workflow.awsConnectionRecovery.readiness !== "ready";
  const partialScanNotice = result ? getReverseEngineeringPartialScanNotice(result) : null;

  return (
    <aside aria-label="Reverse Engineering 설정과 결과" className={styles.rightPanel}>
      <header className={styles.panelHeader}>
        <p className={styles.eyebrow}>Reverse Engineering</p>
        <h2>{result ? "미리보기" : "스캔 설정"}</h2>
        <p>{result ? "AWS에서 읽은 구조를 저장 전 미리보고 있습니다." : "AWS 연결과 범위를 고른 뒤 스캔을 시작하세요."}</p>
      </header>

      <ReverseEngineeringScanSettings createProjectOnApply={createProjectOnApply} workflow={workflow} />

      {isScanning ? (
        <section className={styles.section} aria-live="polite">
          <div className={styles.scanProgress} role="status">
            <LoaderCircle aria-hidden="true" className={styles.inlineSpinner} size={18} />
            <strong>AWS 구조를 읽는 중입니다.</strong>
            <span>현재 처리 단계: 리소스 목록과 연결 관계를 확인하고 있습니다.</span>
          </div>
          {!createProjectOnApply ? (
            <button
              className={styles.secondaryButton}
              disabled={!workflow.activeScanId}
              onClick={() => void workflow.cancelActiveScan()}
              type="button"
            >
              스캔 취소
            </button>
          ) : null}
        </section>
      ) : null}

      {workflow.scanFailure ? (
        <section className={styles.section}>
          <div className={styles.errorNotice} role="alert">
            <strong>{workflow.scanFailure.title}</strong>
            <p>{workflow.scanFailure.description}</p>
          </div>
          <div className={styles.previewActions}>
            {workflow.scanFailure.action === "open_settings" ? (
              <a className={styles.secondaryButton} href={workflow.settingsHref}>
                환경설정으로 이동
              </a>
            ) : null}
            <button className={styles.secondaryButton} disabled={!workflow.canStartScan} onClick={() => void workflow.runScan()} type="button">
              다시 시도
            </button>
          </div>
        </section>
      ) : null}

      {workflow.errorMessage && !workflow.scanFailure ? (
        <section className={styles.section}>
          <div className={styles.errorNotice} role="alert">
            <strong>AWS 스캔을 계속하지 못했습니다.</strong>
            <p>연결과 권한을 확인한 뒤 다시 시도해 주세요.</p>
          </div>
          {hasRecoveryAction ? <a className={styles.secondaryButton} href={workflow.settingsHref}>환경설정으로 이동</a> : null}
        </section>
      ) : null}

      {result ? (
        <ReverseEngineeringPreviewActions
          partialScanNotice={partialScanNotice}
          isDetailsOpen={isDetailsOpen}
          onOpenDetails={onOpenDetails}
          onRequestApply={onRequestApply}
          workflow={workflow}
        />
      ) : null}

      {!createProjectOnApply ? <ReverseEngineeringScanHistory workflow={workflow} /> : null}
    </aside>
  );
}

/** 설정 영역은 스캔 시작 전의 로컬 선택만 바꾸며 API 요청을 만들지 않습니다. */
function ReverseEngineeringScanSettings({
  createProjectOnApply,
  workflow
}: {
  readonly createProjectOnApply: boolean;
  readonly workflow: ReverseEngineeringWorkflow;
}) {
  const selectedRegion = workflow.selectedRegion || workflow.selectedAwsConnection?.region || "ap-northeast-2";
  // 연결이 검증한 리전만 선택지로 남겨 API 계약 밖의 임의 리전을 보낼 수 없게 합니다.
  const regions = [selectedRegion];
  const extraSelections = REVERSE_ENGINEERING_RESOURCE_SELECTIONS.filter(
    (selection) => !PRIMARY_RESOURCE_SELECTIONS.includes(selection as (typeof PRIMARY_RESOURCE_SELECTIONS)[number])
  );

  // 리소스 범위 선택은 hook의 기존 reader-family 정규화를 그대로 씁니다.
  function toggleResourceSelection(resourceType: ReverseEngineeringResourceSelection): void {
    workflow.toggleResourceType(resourceType);
  }

  return (
    <section className={styles.section}>
        <details open>
          <summary className={styles.advancedSummary}>고급 설정</summary>
          <div className={styles.advancedBody}>
            <label className={styles.field}>
              <span>AWS 연결</span>
              <select
                disabled={workflow.loadState === "loading" || workflow.awsConnections.length === 0 || workflow.scanState === "loading"}
                onChange={(event) => workflow.setSelectedAwsConnectionId(event.currentTarget.value)}
                value={workflow.resolvedSelectedAwsConnectionId}
              >
                {workflow.awsConnections.length === 0 ? <option value="">AWS 연결 없음</option> : null}
                {workflow.awsConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {formatAwsConnectionLabel(connection)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>리전</span>
              <select
                disabled={!workflow.selectedAwsConnection || workflow.scanState === "loading"}
                onChange={(event) => workflow.setSelectedRegion(event.currentTarget.value)}
                value={selectedRegion}
              >
                {regions.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
            </label>
            <fieldset className={styles.field}>
              <legend>리소스 범위</legend>
              <div className={styles.scopeGrid}>
                {PRIMARY_RESOURCE_SELECTIONS.map((selection) => (
                  <ResourceScopeToggle
                    key={selection}
                    onToggle={toggleResourceSelection}
                    selectedResourceTypes={workflow.selectedResourceTypes}
                    selection={selection}
                  />
                ))}
              </div>
              <details className={styles.allScopeDetails}>
                <summary>현재 지원하는 리소스 종류 모두 보기</summary>
                <div className={styles.scopeGrid}>
                  {extraSelections.map((selection) => (
                    <ResourceScopeToggle
                      key={selection}
                      onToggle={toggleResourceSelection}
                      selectedResourceTypes={workflow.selectedResourceTypes}
                      selection={selection}
                    />
                  ))}
                </div>
              </details>
            </fieldset>
          </div>
        </details>

        {workflow.awsConnectionRecovery.readiness !== "ready" ? (
          <div className={styles.warningNotice} role="status">
            <strong>{workflow.awsConnectionRecovery.title}</strong>
            <p>{workflow.awsConnectionRecovery.description}</p>
            <a className={styles.secondaryButton} href={workflow.awsConnectionRecovery.settingsHref}>
              {workflow.awsConnectionRecovery.actionLabel}
            </a>
          </div>
        ) : null}

        {!createProjectOnApply && workflow.loadState === "error" ? (
          <button className={styles.secondaryButton} onClick={() => void workflow.loadOptions()} type="button">
            연결 다시 불러오기
          </button>
        ) : null}

    </section>
  );
}

/** 범위 toggle은 화면 라벨만 바꾸고 실제 API 타입은 기존 selection contract로 넘깁니다. */
function ResourceScopeToggle({
  onToggle,
  selectedResourceTypes,
  selection
}: {
  readonly onToggle: (selection: ReverseEngineeringResourceSelection) => void;
  readonly selectedResourceTypes: readonly ReverseEngineeringResourceSelection[];
  readonly selection: ReverseEngineeringResourceSelection;
}) {
  const checked = isReverseEngineeringResourceSelectionChecked(selectedResourceTypes, selection);

  return (
    <label className={styles.scopeToggle}>
      <input checked={checked} onChange={() => onToggle(selection)} type="checkbox" />
      {formatResourceSelectionLabel(selection)}
    </label>
  );
}

/** 스캔 완료 뒤 오른쪽에는 구조 요약과 다음 행동만 간결하게 보여 줍니다. */
function ReverseEngineeringPreviewActions({
  isDetailsOpen,
  onOpenDetails,
  onRequestApply,
  partialScanNotice,
  workflow
}: {
  readonly isDetailsOpen: boolean;
  readonly onOpenDetails: () => void;
  readonly onRequestApply: () => void;
  readonly partialScanNotice: ReturnType<typeof getReverseEngineeringPartialScanNotice>;
  readonly workflow: ReverseEngineeringWorkflow;
}) {
  const result = workflow.selectedCandidateResponse?.result;
  if (!result) {
    return null;
  }

  const isOrganizing = workflow.organizationState === "loading";
  const isSaving = workflow.applyState === "saving";

  // 정리는 preview diagram만 바꾸며 저장은 보드 적용 요청까지 미룹니다.
  function organizePreview(): void {
    void workflow.previewAutomaticOrganization();
  }

  return (
    <section className={styles.resultPanel} aria-label="가져온 구조 요약">
      <div className={styles.resultHeading}>
        <div>
          <p className={styles.eyebrow}>가져온 구조</p>
          <h2>{workflow.placement === "compiled" ? "정리한 구조" : "AWS에서 읽은 구조"}</h2>
        </div>
        <span className={workflow.placement === "compiled" ? styles.statusBadgeSuccess : styles.statusBadge}>
          {workflow.placement === "compiled" ? "정리됨" : "원본 배치"}
        </span>
      </div>
      <dl className={styles.resultMetrics}>
        <div>
          <dt>리소스</dt>
          <dd>{result.discoveredResources.length}</dd>
        </div>
        <div>
          <dt>연결</dt>
          <dd>{result.architectureJson.edges.length}</dd>
        </div>
      </dl>
      {partialScanNotice ? (
        <div className={styles.warningNotice} role="status">
          <strong>{partialScanNotice.title}</strong>
          <p>{partialScanNotice.description}</p>
          {partialScanNotice.action === "open_settings" ? (
            <a className={styles.secondaryButton} href={workflow.resultSettingsHref}>
              AWS 연결 설정
            </a>
          ) : null}
        </div>
      ) : null}
      {workflow.hasCurrentBoardResources ? (
        <fieldset className={styles.applicationModes}>
          <legend>기존 보드 적용 방식</legend>
          <label className={styles.modeChoice}>
            <input
              checked={workflow.applicationMode === "replace"}
              name="reverse-engineering-application-mode"
              onChange={() => workflow.previewApplicationMode("replace")}
              type="radio"
            />
            <strong>현재 보드 교체</strong>
            <span>현재 보드를 이 미리보기 구조로 바꿉니다.</span>
          </label>
          <label className={styles.modeChoice}>
            <input
              checked={workflow.applicationMode === "append"}
              name="reverse-engineering-application-mode"
              onChange={() => workflow.previewApplicationMode("append")}
              type="radio"
            />
            <strong>현재 보드에 추가</strong>
            <span>현재 보드를 유지하고 가져온 구조를 덧붙입니다.</span>
          </label>
        </fieldset>
      ) : null}
      <div className={styles.previewActions}>
        <button className={styles.primaryButton} disabled={!workflow.canApply || isSaving} onClick={onRequestApply} type="button">
          {isSaving ? <LoaderCircle aria-hidden="true" className={styles.inlineSpinner} size={16} /> : null}
          보드에 적용
        </button>
        <button
          aria-busy={isOrganizing}
          className={styles.secondaryButton}
          disabled={isOrganizing || workflow.placement === "compiled"}
          onClick={organizePreview}
          type="button"
        >
          {isOrganizing ? <LoaderCircle aria-hidden="true" className={styles.inlineSpinner} size={16} /> : null}
          {isOrganizing ? "정리하는 중…" : "보기 좋게 정리"}
        </button>
        {workflow.placement === "compiled" ? (
          <button className={styles.secondaryButton} onClick={workflow.previewOriginalPlacement} type="button">
            원본 배치 보기
          </button>
        ) : null}
        <button aria-expanded={isDetailsOpen} className={styles.secondaryButton} onClick={onOpenDetails} type="button">
          상세 정보
        </button>
      </div>
      {isOrganizing ? (
        <div aria-live="polite" className={styles.scanProgress} role="status">
          <LoaderCircle aria-hidden="true" className={styles.inlineSpinner} size={17} />
          <strong>구조를 보기 좋게 정리하고 있습니다.</strong>
          <span>리소스가 많으면 잠시 걸릴 수 있습니다.</span>
        </div>
      ) : null}
      {workflow.applyMessage ? (
        <p
          className={workflow.applyState === "error" ? styles.errorNotice : workflow.applyState === "partial" ? styles.warningNotice : styles.successNotice}
          role={workflow.applyState === "error" ? "alert" : "status"}
        >
          {workflow.applyMessage}
        </p>
      ) : null}
    </section>
  );
}

/** 기존 프로젝트에서만 서버에 저장된 scan 기록을 별도 보조 영역으로 제공합니다. */
function ReverseEngineeringScanHistory({ workflow }: { readonly workflow: ReverseEngineeringWorkflow }) {
  return (
    <section aria-label="스캔 기록" className={styles.historySection}>
      <div className={styles.sectionTitle}>
        <h3>스캔 기록</h3>
        <button className={styles.textButton} disabled={!workflow.canStartScan} onClick={() => void workflow.runScan()} type="button">
          다시 스캔
        </button>
      </div>
      {workflow.isStaleScanResult ? (
        <p className={styles.warningNotice} role="status">이전 스캔 결과입니다. 현재 AWS 상태와 다를 수 있습니다.</p>
      ) : null}
      {workflow.hasDeletedSourceScan ? (
        <p className={styles.warningNotice} role="status">이 보드의 원본 스캔 기록은 삭제되었습니다. 보드는 유지됩니다.</p>
      ) : null}
      {workflow.scanHistory.length === 0 ? (
        <p className={styles.emptyMessage}>아직 저장된 스캔 기록이 없습니다.</p>
      ) : (
        <ul className={styles.historyList}>
          {workflow.scanHistory.slice(0, 8).map((scan) => (
            <li className={styles.historyItem} key={scan.id}>
              <strong>{formatSavedScanLabel(scan.status)}</strong>
              <span>{scan.region} · {formatSavedScanTime(scan.completedAt ?? scan.startedAt ?? scan.createdAt)}</span>
              <div className={styles.historyActions}>
                {scan.status === "running" ? (
                  <button className={styles.secondaryButton} disabled={workflow.isHistoryLoading} onClick={() => void workflow.cancelActiveScan(scan.id)} type="button">취소</button>
                ) : null}
                <button className={styles.secondaryButton} disabled={workflow.isHistoryLoading || workflow.activeScanId === scan.id} onClick={() => void workflow.openHistoricalScan(scan.id)} type="button">다시 열기</button>
                <button className={styles.dangerButton} disabled={workflow.isHistoryLoading} onClick={() => void workflow.deleteSavedScan(scan.id)} type="button">기록 삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.hint}>기록 삭제는 AWS 리소스 삭제가 아니라 SketchCatch 안의 스캔 기록만 지웁니다.</p>
    </section>
  );
}

/** 기존 보드를 덮거나 추가하기 전 저장 대상과 비실행 성격을 다시 확인합니다. */
function ReverseEngineeringApplyConfirmationDialog({
  applicationMode,
  isOpen,
  isSaving,
  onCancel,
  onConfirm
}: {
  readonly applicationMode: "append" | "replace";
  readonly isOpen: boolean;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 확인 dialog도 Escape·포커스 이동·스크롤 잠금을 동일한 공통 helper로 지킵니다.
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
    return setupModalAccessibility({ closeButton, dialog, documentRoot: document, onClose: onCancel, overlay });
  }, [isOpen, onCancel]);

  // modal 바깥 클릭은 취소와 같은 동작으로만 처리합니다.
  function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget && !isSaving) {
      onCancel();
    }
  }

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={styles.modalBackdrop} onMouseDown={handleBackdropMouseDown} ref={overlayRef}>
      <section aria-labelledby="reverse-engineering-apply-title" aria-modal="true" className={styles.modalDialogSmall} ref={dialogRef} role="dialog">
        <header className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>보드 적용 확인</span>
            <h2 id="reverse-engineering-apply-title">{applicationMode === "replace" ? "현재 보드를 교체할까요?" : "현재 보드에 구조를 추가할까요?"}</h2>
            <p>선택한 구조를 현재 프로젝트 보드에 반영합니다.</p>
          </div>
          <button aria-label="보드 적용 취소" className={styles.iconButton} disabled={isSaving} onClick={onCancel} ref={closeButtonRef} type="button">
            <X aria-hidden="true" size={17} />
          </button>
        </header>
        <footer className={styles.modalFooter}>
          <button className={styles.secondaryButton} disabled={isSaving} onClick={onCancel} type="button">취소</button>
          <button className={styles.primaryButton} disabled={isSaving} onClick={onConfirm} type="button">
            {isSaving ? <LoaderCircle aria-hidden="true" className={styles.inlineSpinner} size={16} /> : <CheckCircle2 aria-hidden="true" size={16} />}
            {isSaving ? "저장 중…" : "보드에 적용"}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

/** Portal 대상이 준비된 경우에만 좌측/가운데 slot으로 JSX를 이동합니다. */
function createReverseEngineeringPortal(content: ReactNode, targetId: string): ReactPortal | null {
  const target = document.getElementById(targetId);
  return target ? createPortal(content, target) : null;
}

/** 상단 바에 쓰는 scan 상태를 짧고 일정한 문장으로 정리합니다. */
function getReverseEngineeringWorkspaceStatus({
  canApply,
  hasPreview,
  isScanning,
  scanFailed
}: {
  readonly canApply: boolean;
  readonly hasPreview: boolean;
  readonly isScanning: boolean;
  readonly scanFailed: boolean;
}): string {
  if (isScanning) {
    return "스캔 중";
  }
  if (hasPreview) {
    return canApply ? "적용 준비" : "미리보기";
  }
  if (scanFailed) {
    return "확인 필요";
  }
  return "스캔 전";
}

/** connection의 내부 id 대신 계정과 리전처럼 사용자가 확인할 수 있는 정보만 보여 줍니다. */
function formatAwsConnectionLabel(connection: AwsConnection): string {
  const account = connection.accountId ? `AWS 계정 ${connection.accountId}` : "AWS 연결";
  return `${account} · ${connection.region}`;
}

/** 전체/대표 리소스 범위는 코드명이 아니라 화면에서 읽기 쉬운 라벨로 표시합니다. */
function formatResourceSelectionLabel(selection: ReverseEngineeringResourceSelection): string {
  if (selection === "ALL") {
    return "전체";
  }
  return selection.replaceAll("_", " ");
}

/** scan 기록의 상태를 사람이 읽는 짧은 말로 바꿉니다. */
function formatSavedScanLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    cancelled: "취소됨",
    completed: "완료",
    failed: "실패",
    running: "진행 중"
  };
  return labels[status] ?? "스캔 기록";
}

/** ISO 시간을 locale 형식으로 바꾸되 파싱 실패 시 원문 시간을 유지합니다. */
function formatSavedScanTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(timestamp);
}

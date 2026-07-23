"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronLeft } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import type { DiagramNode } from "../../../../../packages/types/src";
import { useAuth } from "../../../components/auth/auth-provider";
import { DiagramEditor, type DiagramEditorPanelContext } from "../../../features/diagram-editor";
import { EMPTY_DIAGRAM } from "../../../features/diagram-editor/constants";
import {
  ReverseEngineeringPanel,
  type ReverseEngineeringCandidatePanelState,
  type ReverseEngineeringInitialScanActionState
} from "../../../features/workspace/ReverseEngineeringPanel";
import { ReverseEngineeringStartCard } from "../../../features/workspace/ReverseEngineeringStartCard";
import styles from "../../../features/workspace/reverse-engineering.module.css";
import { getReverseEngineeringServiceLabel } from "../../../features/workspace/reverse-engineering-presentation";
import {
  getReverseEngineeringInspectorCoreValues,
  getReverseEngineeringInspectorPurpose
} from "../../../features/workspace/reverse-engineering-resource-inspector";

type ReverseWorkspaceClientProps = {
  readonly projectName: string;
};

const REVERSE_PREVIEW_PROJECT_ID = "reverse-preview-project";
const EMPTY_CANDIDATE_PANEL_STATE: ReverseEngineeringCandidatePanelState = {
  candidates: [],
  hasScanResult: false,
  onCandidateSelect: () => undefined,
  selectedCandidateId: null
};

type ReverseEngineeringInitialScanActionPresentation = Omit<
  ReverseEngineeringInitialScanActionState,
  "onScanStart"
>;

// Reverse 전용 전체 화면에서 AWS scan 후보를 보드 미리보기로 보여줍니다.
export function ReverseWorkspaceClient({ projectName }: ReverseWorkspaceClientProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [candidatePanelState, setCandidatePanelState] =
    useState<ReverseEngineeringCandidatePanelState>(EMPTY_CANDIDATE_PANEL_STATE);
  const [initialScanAction, setInitialScanAction] =
    useState<ReverseEngineeringInitialScanActionPresentation | null>(null);
  const initialScanStartRef = useRef<(() => void) | null>(null);
  const workspaceUserName =
    user?.nickname?.trim() || user?.username?.trim() || user?.email?.trim() || "Personal workspace";

  const chooseAnotherStartMode = useCallback((): void => {
    router.push("/workspace/new");
  }, [router]);

  // gg: 패널 안의 실제 스캔 함수를 중앙 시작 카드에서도 같은 흐름으로 호출합니다.
  const handleInitialScanActionChange = useCallback(
    (next: ReverseEngineeringInitialScanActionState | null): void => {
      initialScanStartRef.current = next?.onScanStart ?? null;
      const nextPresentation = next
        ? {
            awsConnectionRecovery: next.awsConnectionRecovery,
            canStartScan: next.canStartScan,
            failure: next.failure,
            isLoadingOptions: next.isLoadingOptions,
            isScanning: next.isScanning
          }
        : null;

      setInitialScanAction((current) =>
        isSameInitialScanActionPresentation(current, nextPresentation) ? current : nextPresentation
      );
    },
    []
  );

  // gg: 카드가 직접 API를 부르지 않아 기존 Reverse Engineering 스캔 계약을 그대로 유지합니다.
  const startInitialScan = useCallback((): void => {
    initialScanStartRef.current?.();
  }, []);

  return (
    <DiagramEditor
      allowPreviewInspection
      emptyBoardContent={
        !candidatePanelState.hasScanResult ? (
          <ReverseEngineeringStartCard
            awsConnectionRecovery={initialScanAction?.awsConnectionRecovery ?? null}
            canStartScan={initialScanAction?.canStartScan ?? false}
            failure={initialScanAction?.failure ?? null}
            isLoadingOptions={initialScanAction?.isLoadingOptions ?? true}
            isScanning={initialScanAction?.isScanning ?? false}
            onScanStart={startInitialScan}
          />
        ) : undefined
      }
      emptyBoardDescription="AWS 연결을 확인하는 중입니다."
      initialDiagram={EMPTY_DIAGRAM}
      leftPanel={
        <ReverseBoardCandidateSelectionPanel
          onChooseAnotherStartMode={chooseAnotherStartMode}
          state={candidatePanelState}
        />
      }
      projectName={projectName}
      rightPanel={(context) => (
        <ReverseDockedPanel
          context={context}
          onCandidatePanelChange={setCandidatePanelState}
          onInitialScanActionChange={handleInitialScanActionChange}
          projectName={projectName}
        />
      )}
      saveStatus="미리보기"
      showSaveAction={false}
      workspaceUserName={workspaceUserName}
    />
  );
}

// 자동 판단 결과가 하나면 추천 구조만, 애매할 때만 여러 선택지를 보여줍니다.
export function ReverseBoardCandidateSelectionPanel({
  onChooseAnotherStartMode,
  state
}: {
  readonly onChooseAnotherStartMode: () => void;
  readonly state: ReverseEngineeringCandidatePanelState;
}) {
  if (!state.hasScanResult) {
    return (
      <aside className={styles.candidatePanel} aria-label="Reverse Engineering 시작">
        <button className={styles.startBackButton} onClick={onChooseAnotherStartMode} type="button">
          <ArrowLeft aria-hidden="true" size={15} />
          시작 방식 다시 선택
        </button>
      </aside>
    );
  }

  const hasMultipleCandidates = state.candidates.length > 1;
  const panelTitle = "가져온 구조";
  const panelDescription = "AWS에서 가져온 리소스와 연결입니다.";

  return (
    <aside className={styles.candidatePanel} aria-label={panelTitle}>
      <div className={styles.candidateIntro}>
        <p className={styles.eyebrow}>Reverse Engineering</p>
        <h2>{panelTitle}</h2>
        <span>{panelDescription}</span>
      </div>

      {state.hasScanResult && hasMultipleCandidates ? (
        <div className={styles.candidateList} role="radiogroup" aria-label={panelTitle}>
          {state.candidates.map((candidate) => (
            <button
              aria-checked={candidate.id === state.selectedCandidateId}
              className={
                candidate.id === state.selectedCandidateId
                  ? styles.candidateCardSelected
                  : styles.candidateCard
              }
              key={candidate.id}
              onClick={() => state.onCandidateSelect(candidate.id)}
              role="radio"
              type="button"
            >
              <strong>{candidate.title}</strong>
              <span>{candidate.description}</span>
              <small>
                Resource {candidate.resourceCount}개 · 연결선 {candidate.edgeCount}개
              </small>
            </button>
          ))}
        </div>
      ) : state.candidates[0] ? (
        <div className={styles.recommendedStructure}>
          <span className={styles.recommendationLabel}>
            <CheckCircle2 aria-hidden="true" size={15} />
            가져온 결과
          </span>
          <strong>{state.candidates[0].title}</strong>
          <span>{state.candidates[0].description}</span>
          <small>
            Resource {state.candidates[0].resourceCount}개 · 연결선 {state.candidates[0].edgeCount}
            개
          </small>
        </div>
      ) : null}

      <button className={styles.startBackButton} onClick={onChooseAnotherStartMode} type="button">
        <ArrowLeft aria-hidden="true" size={15} />
        시작 방식 다시 선택
      </button>
    </aside>
  );
}

// 평소에는 스캔과 적용 흐름을, Resource를 누르면 사람이 이해할 핵심 값만 보여줍니다.
function ReverseDockedPanel({
  context,
  onCandidatePanelChange,
  onInitialScanActionChange,
  projectName
}: {
  readonly context: DiagramEditorPanelContext;
  readonly onCandidatePanelChange: (state: ReverseEngineeringCandidatePanelState) => void;
  readonly onInitialScanActionChange: (
    state: ReverseEngineeringInitialScanActionState | null
  ) => void;
  readonly projectName: string;
}) {
  const inspectedNode = context.nodes.find((node) => node.id === context.inspectedNodeId) ?? null;

  if (inspectedNode) {
    return <ReverseResourceInspector node={inspectedNode} onBack={context.closeInspectedNode} />;
  }

  return (
    <section className={styles.rightPanel} aria-label="기존 AWS 가져오기 패널">
      <ReverseEngineeringPanel
        context={context}
        createProjectOnApply
        onCandidatePanelChange={onCandidatePanelChange}
        onInitialScanActionChange={onInitialScanActionChange}
        projectId={REVERSE_PREVIEW_PROJECT_ID}
        projectName={projectName}
      />
    </section>
  );
}

// gg: 패널 상태가 매번 새 객체여도 같은 내용이면 부모를 다시 렌더하지 않게 합니다.
function isSameInitialScanActionPresentation(
  left: ReverseEngineeringInitialScanActionPresentation | null,
  right: ReverseEngineeringInitialScanActionPresentation | null
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.awsConnectionRecovery.readiness === right.awsConnectionRecovery.readiness &&
    left.awsConnectionRecovery.settingsHref === right.awsConnectionRecovery.settingsHref &&
    left.awsConnectionRecovery.selectedConnectionId ===
      right.awsConnectionRecovery.selectedConnectionId &&
    left.canStartScan === right.canStartScan &&
    left.failure?.action === right.failure?.action &&
    left.failure?.description === right.failure?.description &&
    left.failure?.title === right.failure?.title &&
    left.isLoadingOptions === right.isLoadingOptions &&
    left.isScanning === right.isScanning
  );
}

// provider identity와 전체 원본 JSON은 보존하되 사용자 화면에는 노출하지 않습니다.
function ReverseResourceInspector({
  node,
  onBack
}: {
  readonly node: DiagramNode;
  readonly onBack: () => void;
}) {
  const values = node.parameters?.values ?? {};
  const providerResourceId = formatInspectorValue(values["providerResourceId"]);
  const providerResourceType = formatInspectorValue(values["providerResourceType"]);
  const isReviewOnly = node.type === "UNKNOWN" || values["analysisExcluded"] === true;
  const coreValues = getReverseEngineeringInspectorCoreValues(node.type, values);
  const displayName = getInspectorDisplayName(node.label, providerResourceId, providerResourceType);

  return (
    <aside className={styles.inspector} aria-label="Reverse Resource 상세">
      <header className={styles.inspectorHeader}>
        <div className={styles.inspectorHeaderTop}>
          <button
            aria-label="스캔 결과로 돌아가기"
            className={styles.iconButton}
            onClick={onBack}
            title="스캔 결과로 돌아가기"
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={17} />
          </button>
          <div className={styles.panelHeaderTitle}>
            <p className={styles.eyebrow}>Resource 정보</p>
            <h2>{displayName}</h2>
          </div>
        </div>
        <p className={styles.hint}>
          AWS에서 읽은 핵심 정보입니다. 이 화면에서는 변경하지 않습니다.
        </p>
      </header>

      <div className={styles.inspectorBody}>
        <section className={styles.inspectorSection}>
          <h3>Resource 개요</h3>
          <dl className={styles.identityList}>
            <div>
              <dt>이름</dt>
              <dd>{displayName}</dd>
            </div>
            <div>
              <dt>AWS 서비스</dt>
              <dd>{getReverseEngineeringServiceLabel(providerResourceType)}</dd>
            </div>
            <div>
              <dt>리전</dt>
              <dd>{formatInspectorValue(values["region"])}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>
                <span className={isReviewOnly ? styles.reviewOnlyBadge : styles.supportedBadge}>
                  {isReviewOnly ? "보드에서만 확인" : "Terraform 편집 대상"}
                </span>
              </dd>
            </div>
          </dl>
          <p className={styles.inspectorPurpose}>
            {getReverseEngineeringInspectorPurpose(node.type, isReviewOnly)}
          </p>
        </section>

        {coreValues.length > 0 ? (
          <section className={styles.inspectorSection}>
            <h3>핵심 값</h3>
            <dl className={styles.identityList}>
              {coreValues.map((value) => (
                <div key={value.key}>
                  <dt>{value.label}</dt>
                  <dd>{value.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

// 값이 없는 provider identity는 화면에서 분명하게 구분합니다.
function formatInspectorValue(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "확인되지 않음";
}

function getInspectorDisplayName(
  label: string,
  providerResourceId: string,
  providerResourceType: string
): string {
  const displayName = label.replace(/^확인 필요 · /, "").trim();

  return isHumanInspectorDisplayName(displayName, providerResourceId)
    ? displayName
    : `이름 미확인 ${getReverseEngineeringServiceLabel(providerResourceType)}`;
}

function isHumanInspectorDisplayName(displayName: string, providerResourceId: string): boolean {
  return !(
    !displayName ||
    displayName === providerResourceId ||
    displayName.startsWith("arn:") ||
    displayName.startsWith("resource-") ||
    /^(?:vpc|subnet|i|igw|rtb|sg|eni|nat|eipalloc|eipassoc|vol|ami|snap|acl|vpce)-[0-9a-f]{8,}$/i.test(
      displayName
    )
  );
}

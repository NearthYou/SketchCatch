"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronLeft } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { DiagramJson, DiagramNode } from "../../../../../packages/types/src";
import { useAuth } from "../../../components/auth/auth-provider";
import { DiagramEditor, type DiagramEditorPanelContext } from "../../../features/diagram-editor";
import { EMPTY_DIAGRAM } from "../../../features/diagram-editor/constants";
import {
  ReverseEngineeringPanel,
  type ReverseEngineeringCandidatePanelState
} from "../../../features/workspace/ReverseEngineeringPanel";
import styles from "../../../features/workspace/reverse-engineering.module.css";

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

// Reverse 전용 전체 화면에서 AWS scan 후보를 보드 미리보기로 보여줍니다.
export function ReverseWorkspaceClient({ projectName }: ReverseWorkspaceClientProps) {
  const router = useRouter();
  const { user } = useAuth();
  const latestDiagramRef = useRef<DiagramJson>(EMPTY_DIAGRAM);
  const [candidatePanelState, setCandidatePanelState] =
    useState<ReverseEngineeringCandidatePanelState>(EMPTY_CANDIDATE_PANEL_STATE);
  const workspaceUserName =
    user?.nickname?.trim() || user?.username?.trim() || user?.email?.trim() || "Personal workspace";

  // DiagramEditor의 initialDiagram을 다시 바꾸면 preview가 초기화되므로 저장용 ref만 갱신합니다.
  const handleDiagramChange = useCallback((nextDiagram: DiagramJson): void => {
    latestDiagramRef.current = nextDiagram;
  }, []);

  // Reverse 시작 화면에서는 아직 저장할 프로젝트가 없어서 저장 버튼을 눌러도 서버에는 쓰지 않습니다.
  const keepPreviewOnly = useCallback(async (): Promise<DiagramJson> => {
    return latestDiagramRef.current;
  }, []);

  const chooseAnotherStartMode = useCallback((): void => {
    router.push("/workspace/new");
  }, [router]);

  return (
    <DiagramEditor
      allowPreviewInspection
      emptyBoardDescription="기존 AWS를 가져오면 복원한 구조가 여기에 표시됩니다."
      initialDiagram={EMPTY_DIAGRAM}
      leftPanel={
        <ReverseBoardCandidateSelectionPanel
          onChooseAnotherStartMode={chooseAnotherStartMode}
          state={candidatePanelState}
        />
      }
      onDiagramChange={handleDiagramChange}
      onDiagramSaveRequest={keepPreviewOnly}
      projectName={projectName}
      rightPanel={(context) => (
        <ReverseDockedPanel
          context={context}
          onCandidatePanelChange={setCandidatePanelState}
          projectName={projectName}
        />
      )}
      saveStatus="미리보기"
      workspaceUserName={workspaceUserName}
    />
  );
}

// 자동 판단 결과가 하나면 추천 구조만, 애매할 때만 여러 선택지를 보여줍니다.
function ReverseBoardCandidateSelectionPanel({
  onChooseAnotherStartMode,
  state
}: {
  readonly onChooseAnotherStartMode: () => void;
  readonly state: ReverseEngineeringCandidatePanelState;
}) {
  const hasMultipleCandidates = state.candidates.length > 1;
  const panelTitle = state.hasScanResult && !hasMultipleCandidates ? "자동 감지된 구조" : "보드 후보 선택";
  const panelDescription =
    state.hasScanResult && !hasMultipleCandidates
      ? "자동으로 묶은 결과입니다. 헷갈릴 때만 여러 후보가 표시됩니다."
      : "자동 판단이 애매할 때만 여러 후보를 보여줍니다.";

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
      ) : state.hasScanResult && state.candidates[0] ? (
        <div className={styles.recommendedStructure}>
          <span className={styles.recommendationLabel}>
            <CheckCircle2 aria-hidden="true" size={15} />
            자동 추천
          </span>
          <strong>{state.candidates[0].title}</strong>
          <span>{state.candidates[0].description}</span>
          <small>
            Resource {state.candidates[0].resourceCount}개 · 연결선 {state.candidates[0].edgeCount}개
          </small>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <strong>아직 감지된 구조가 없습니다</strong>
          <span>기존 AWS를 가져오면 가져온 구조가 여기에 표시됩니다.</span>
        </div>
      )}

      <button className={styles.startBackButton} onClick={onChooseAnotherStartMode} type="button">
        <ArrowLeft aria-hidden="true" size={15} />
        시작 방식 다시 선택
      </button>
    </aside>
  );
}

// 평소에는 스캔과 적용 흐름을, Resource를 누르면 AWS 원본 값을 보여줍니다.
function ReverseDockedPanel({
  context,
  onCandidatePanelChange,
  projectName
}: {
  readonly context: DiagramEditorPanelContext;
  readonly onCandidatePanelChange: (state: ReverseEngineeringCandidatePanelState) => void;
  readonly projectName: string;
}) {
  const inspectedNode = context.nodes.find((node) => node.id === context.inspectedNodeId) ?? null;

  if (inspectedNode) {
    return (
      <ReverseResourceInspector
        node={inspectedNode}
        onBack={context.closeInspectedNode}
      />
    );
  }

  return (
    <section className={styles.rightPanel} aria-label="기존 AWS 가져오기 패널">
      <ReverseEngineeringPanel
        context={context}
        createProjectOnApply
        onCandidatePanelChange={onCandidatePanelChange}
        projectId={REVERSE_PREVIEW_PROJECT_ID}
        projectName={projectName}
      />
    </section>
  );
}

// 선택한 Resource의 provider identity와 읽어온 값을 수정 없이 보여줍니다.
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
            <p className={styles.eyebrow}>Resource Inspector</p>
            <h2>{node.label}</h2>
          </div>
        </div>
        <p className={styles.hint}>AWS에서 읽은 원본 값입니다. 이 화면에서는 변경하지 않습니다.</p>
      </header>

      <div className={styles.inspectorBody}>
        <section className={styles.inspectorSection}>
          <h3>AWS에서 읽은 원본 값</h3>
          <dl className={styles.identityList}>
            <div>
              <dt>Provider Resource ID</dt>
              <dd>{providerResourceId}</dd>
            </div>
            <div>
              <dt>Provider Resource Type</dt>
              <dd>{providerResourceType}</dd>
            </div>
            <div>
              <dt>Resource Type</dt>
              <dd>{node.type}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.inspectorSection}>
          <h3>전체 파라미터</h3>
          <pre className={styles.inspectorCode}>
            <code>{JSON.stringify(values, null, 2)}</code>
          </pre>
        </section>
      </div>
    </aside>
  );
}

// 값이 없는 provider identity는 화면에서 분명하게 구분합니다.
function formatInspectorValue(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "확인되지 않음";
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { DiagramJson } from "../../../../../packages/types/src";
import { DiagramEditor } from "../../../features/diagram-editor";
import { EMPTY_DIAGRAM } from "../../../features/diagram-editor/constants";
import {
  ReverseEngineeringPanel,
  type ReverseEngineeringCandidatePanelState
} from "../../../features/workspace/ReverseEngineeringPanel";

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
  const latestDiagramRef = useRef<DiagramJson>(EMPTY_DIAGRAM);
  const [candidatePanelState, setCandidatePanelState] =
    useState<ReverseEngineeringCandidatePanelState>(EMPTY_CANDIDATE_PANEL_STATE);

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
      initialDiagram={EMPTY_DIAGRAM}
      leftPanel={
        <ReverseBoardCandidateSelectionPanel
          onChooseAnotherStartMode={chooseAnotherStartMode}
          state={candidatePanelState}
        />
      }
      floatingPanel={(context) => (
        <section className="reverseImportPanelShell" aria-label="기존 AWS 가져오기 패널">
          <ReverseEngineeringPanel
            context={context}
            createProjectOnApply
            onCandidatePanelChange={setCandidatePanelState}
            projectId={REVERSE_PREVIEW_PROJECT_ID}
            projectName={projectName}
          />
        </section>
      )}
      onDiagramChange={handleDiagramChange}
      onDiagramSaveRequest={keepPreviewOnly}
      projectName={projectName}
      rightPanel={null}
      saveStatus="미리보기"
    />
  );
}

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
    <aside className="reverseCandidateSelectionPanel" aria-label={panelTitle}>
      <div className="reverseCandidateSelectionIntro">
        <p className="reverseStartGuideEyebrow">Reverse Engineering</p>
        <h2>{panelTitle}</h2>
        <span>{panelDescription}</span>
      </div>

      {state.hasScanResult ? (
        <div className="reverseCandidateSelectionList" role="radiogroup" aria-label={panelTitle}>
          {state.candidates.map((candidate) => (
            <button
              aria-checked={candidate.id === state.selectedCandidateId}
              className={
                candidate.id === state.selectedCandidateId
                  ? "reverseCandidateSelectionCard reverseCandidateSelectionCardSelected"
                  : "reverseCandidateSelectionCard"
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
      ) : (
        <div className="reverseCandidateSelectionEmpty">
          <strong>아직 감지된 구조가 없습니다</strong>
          <span>오른쪽에서 기존 AWS 가져오기를 누르면 이곳에 자동 감지 결과가 표시됩니다.</span>
        </div>
      )}

      <button className="reverseStartBackButton" onClick={onChooseAnotherStartMode} type="button">
        시작 방식 다시 선택
      </button>
    </aside>
  );
}

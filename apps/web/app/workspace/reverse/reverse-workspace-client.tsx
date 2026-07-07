"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { DiagramJson } from "../../../../../packages/types/src";
import { DiagramEditor } from "../../../features/diagram-editor";
import { EMPTY_DIAGRAM } from "../../../features/diagram-editor/constants";
import { ReverseEngineeringPanel } from "../../../features/workspace/ReverseEngineeringPanel";

type ReverseWorkspaceClientProps = {
  readonly projectName: string;
};

const REVERSE_PREVIEW_PROJECT_ID = "reverse-preview-project";

// Reverse 전용 전체 화면에서 AWS scan 후보를 보드 미리보기로 보여줍니다.
export function ReverseWorkspaceClient({ projectName }: ReverseWorkspaceClientProps) {
  const router = useRouter();
  const latestDiagramRef = useRef<DiagramJson>(EMPTY_DIAGRAM);
  const [diagram, setDiagram] = useState<DiagramJson>(EMPTY_DIAGRAM);

  // DiagramEditor가 미리보기나 적용 결과를 바꾸면 최신 보드 상태를 기억합니다.
  const handleDiagramChange = useCallback((nextDiagram: DiagramJson): void => {
    latestDiagramRef.current = nextDiagram;
    setDiagram(nextDiagram);
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
      initialDiagram={diagram}
      leftPanel={<ReverseStartGuide onChooseAnotherStartMode={chooseAnotherStartMode} />}
      floatingPanel={(context) => (
        <section className="reverseImportPanelShell" aria-label="기존 AWS 가져오기 패널">
          <ReverseEngineeringPanel
            context={context}
            createProjectOnApply
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

// 왼쪽 패널은 사용자가 지금 빈 보드를 편집하는 게 아니라 AWS를 먼저 읽는 중임을 알려줍니다.
function ReverseStartGuide({
  onChooseAnotherStartMode
}: {
  readonly onChooseAnotherStartMode: () => void;
}) {
  return (
    <aside className="reverseStartGuide" aria-label="Reverse Engineering 안내">
      <p>Reverse Engineering</p>
      <h2>기존 AWS를 먼저 가져옵니다</h2>
      <span>
        가져오기 패널에서 기존 AWS 가져오기를 누르면 보드에 후보가 미리 보입니다.
        프로젝트는 후보를 적용할 때 만들어집니다.
      </span>
      <button className="reverseStartBackButton" onClick={onChooseAnotherStartMode} type="button">
        시작 방식 다시 선택
      </button>
    </aside>
  );
}

import { AiWorkspaceClient } from "./AiWorkspaceClient";

export default function WorkspacePage() {
  return (
    <main className="workspaceShell">
      <header className="workspaceHeader">
        <p className="eyebrow">AI Analysis Workspace</p>
        <h1>SketchCatch AI 작업대</h1>
        <p>
          자연어와 GitHub 링크로 설계 초안을 만들고, 배포 전 비용/보안 위험과 Terraform
          Preview 설명을 한 화면에서 확인합니다.
        </p>
      </header>
      <AiWorkspaceClient />
    </main>
  );
}

import { redirect } from "next/navigation";

// Natural Language Diagramming은 별도 AI 화면이 아니라 workspace 보드 안에서 실행합니다.
export default function WorkspaceAiPage() {
  redirect("/workspace");
}

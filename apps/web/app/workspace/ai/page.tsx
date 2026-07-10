import { WorkspaceAuthGate } from "../workspace-auth-gate";
import { WorkspaceAiStartClient } from "./workspace-ai-start-client";

export default function WorkspaceAiPage() {
  return (
    <WorkspaceAuthGate>
      <WorkspaceAiStartClient />
    </WorkspaceAuthGate>
  );
}

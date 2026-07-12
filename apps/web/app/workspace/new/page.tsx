import { WorkspaceAuthGate } from "../workspace-auth-gate";
import { WorkspaceStartClient } from "./workspace-start-client";

export default function NewWorkspacePage() {
  return (
    <WorkspaceAuthGate>
      <WorkspaceStartClient />
    </WorkspaceAuthGate>
  );
}

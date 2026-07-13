import type { ComponentProps } from "react";
import { DeploymentConsoleShell } from "./DeploymentConsoleShell";

export {
  initialPreDeploymentCheckState,
  type DeploymentPreDeploymentCheckState
} from "./DirectDeploymentScreen";

export type DeploymentPanelProps = ComponentProps<typeof DeploymentConsoleShell>;

export function DeploymentPanel(props: DeploymentPanelProps) {
  return <DeploymentConsoleShell {...props} />;
}

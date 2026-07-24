import type { ComponentProps } from "react";
import { DeploymentConsoleShell } from "./DeploymentConsoleShell";

export {
  initialPreDeploymentCheckState,
  type DeploymentPreDeploymentCheckState
} from "./DirectDeploymentScreen";

export type DeploymentPanelProps = ComponentProps<typeof DeploymentConsoleShell>;

// Keep the existing panel entry point while the console shell owns managed deployment and CI/CD screens.
export function DeploymentPanel(props: DeploymentPanelProps) {
  return <DeploymentConsoleShell {...props} />;
}

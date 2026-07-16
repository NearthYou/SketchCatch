import type {
  DeployedResource,
  DeploymentLog,
  TerraformOutput
} from "@sketchcatch/types";

export type DeploymentHistoryDetailsState = {
  readonly deploymentId: string;
  readonly errorMessage: string;
  readonly logs: DeploymentLog[];
  readonly outputs: TerraformOutput[];
  readonly requestState: "idle" | "loading" | "success" | "error";
  readonly resources: DeployedResource[];
};

export const initialDeploymentHistoryDetailsState: DeploymentHistoryDetailsState = {
  deploymentId: "",
  errorMessage: "",
  logs: [],
  outputs: [],
  requestState: "idle",
  resources: []
};

export function beginDeploymentHistoryDetailsLoad(
  deploymentId: string
): DeploymentHistoryDetailsState {
  return {
    deploymentId,
    errorMessage: "",
    logs: [],
    outputs: [],
    requestState: "loading",
    resources: []
  };
}

export function completeDeploymentHistoryDetailsLoad(
  current: DeploymentHistoryDetailsState,
  input: {
    readonly deploymentId: string;
    readonly logs: DeploymentLog[];
    readonly outputs: TerraformOutput[];
    readonly resources: DeployedResource[];
  }
): DeploymentHistoryDetailsState {
  if (current.deploymentId !== input.deploymentId || current.requestState !== "loading") {
    return current;
  }

  return {
    ...input,
    errorMessage: "",
    requestState: "success"
  };
}

export function failDeploymentHistoryDetailsLoad(
  current: DeploymentHistoryDetailsState,
  input: { readonly deploymentId: string; readonly errorMessage: string }
): DeploymentHistoryDetailsState {
  if (current.deploymentId !== input.deploymentId || current.requestState !== "loading") {
    return current;
  }

  return {
    ...current,
    errorMessage: input.errorMessage,
    requestState: "error"
  };
}

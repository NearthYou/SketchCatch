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

export type DeploymentLogView = {
  readonly errorMessage: string;
  readonly isLoading: boolean;
  readonly logs: DeploymentLog[];
  readonly source: "current" | "history";
};

export function selectDeploymentLogView(input: {
  readonly currentDeploymentId: string;
  readonly currentLogs: DeploymentLog[];
  readonly historyDeploymentId: string;
  readonly historyErrorMessage: string;
  readonly historyIsLoading: boolean;
  readonly historyLogs: DeploymentLog[];
}): DeploymentLogView {
  const showCurrentDeployment =
    input.currentDeploymentId.length > 0 &&
    input.currentDeploymentId !== input.historyDeploymentId;

  if (showCurrentDeployment) {
    return {
      errorMessage: "",
      isLoading: false,
      logs: input.currentLogs,
      source: "current"
    };
  }

  return {
    errorMessage: input.historyErrorMessage,
    isLoading: input.historyIsLoading,
    logs: input.historyLogs,
    source: "history"
  };
}

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

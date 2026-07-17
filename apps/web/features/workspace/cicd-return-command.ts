import type { GitCicdReadinessItemKey } from "@sketchcatch/types";

const readinessKeys = new Set<GitCicdReadinessItemKey>([
  "approved_apply_plan",
  "initial_application_release",
  "source_repository",
  "monitoring_config",
  "deployment_target"
]);

export type InitialCicdReturnCommand = {
  readonly projectId: string;
  readonly shouldOpenDeploymentConsole: true;
  readonly activeScreen: "cicd";
  readonly readinessKey: GitCicdReadinessItemKey;
  readonly cleanedHref: string;
};

export type PendingCicdReturn = {
  readonly projectId: string;
  readonly reason: "approved_apply_plan" | "initial_application_release";
};

export type CompletedCicdReturn = {
  readonly activeScreen: "cicd";
  readonly readinessRefreshRequestId: number;
  readonly pending: null;
};

export type CicdReturnCommandConsoleState = {
  readonly projectId: string;
  readonly activeScreen: "deployment" | "cicd";
  readonly readinessRefreshRequestId: number;
};

export function createPendingCicdReturn(
  projectId: string,
  reason: PendingCicdReturn["reason"] = "approved_apply_plan"
): PendingCicdReturn {
  return { projectId, reason };
}

export function cancelPendingCicdReturn(_pending: PendingCicdReturn | null): null {
  return null;
}

export function acknowledgeInitialCicdReturnCommand(input: {
  readonly command: InitialCicdReturnCommand;
  readonly consoleState: CicdReturnCommandConsoleState | null;
}): string | null {
  if (
    !input.consoleState ||
    input.consoleState.projectId !== input.command.projectId ||
    input.consoleState.activeScreen !== input.command.activeScreen ||
    input.consoleState.readinessRefreshRequestId < 1
  ) {
    return null;
  }

  return input.command.cleanedHref;
}

export function completePendingCicdReturn(input: {
  readonly pending: PendingCicdReturn | null;
  readonly approvedDeployment: {
    readonly projectId: string;
    readonly currentPlanOperation: "apply" | "destroy" | null;
  };
  readonly currentRefreshRequestId: number;
}): CompletedCicdReturn | null {
  if (
    !input.pending ||
    input.pending.reason !== "approved_apply_plan" ||
    input.pending.projectId !== input.approvedDeployment.projectId ||
    input.approvedDeployment.currentPlanOperation !== "apply"
  ) {
    return null;
  }

  return {
    activeScreen: "cicd",
    readinessRefreshRequestId: input.currentRefreshRequestId + 1,
    pending: null
  };
}

export function completePendingCicdReturnAfterDeployment(input: {
  readonly pending: PendingCicdReturn | null;
  readonly deployment: {
    readonly projectId: string;
    readonly scope: "infrastructure" | "application" | "full_stack";
    readonly status: string;
  };
  readonly currentRefreshRequestId: number;
}): CompletedCicdReturn | null {
  if (
    !input.pending ||
    input.pending.reason !== "initial_application_release" ||
    input.pending.projectId !== input.deployment.projectId ||
    input.deployment.status !== "SUCCESS" ||
    (input.deployment.scope !== "application" && input.deployment.scope !== "full_stack")
  ) {
    return null;
  }

  return {
    activeScreen: "cicd",
    readinessRefreshRequestId: input.currentRefreshRequestId + 1,
    pending: null
  };
}

export function resolveInitialCicdReturnCommand(input: {
  readonly currentProjectId: string;
  readonly requestedProjectId: string | null | undefined;
  readonly projectName: string | null | undefined;
  readonly deploymentView: string | null | undefined;
  readonly readinessKey: string | null | undefined;
}): InitialCicdReturnCommand | null {
  if (
    input.deploymentView !== "cicd" ||
    input.requestedProjectId !== input.currentProjectId ||
    !isGitCicdReadinessItemKey(input.readinessKey)
  ) {
    return null;
  }

  const cleanedSearch = new URLSearchParams({ projectId: input.currentProjectId });
  const projectName = input.projectName?.trim();
  if (projectName) {
    cleanedSearch.set("projectName", projectName);
  }

  return {
    projectId: input.currentProjectId,
    shouldOpenDeploymentConsole: true,
    activeScreen: "cicd",
    readinessKey: input.readinessKey,
    cleanedHref: `/workspace?${cleanedSearch.toString()}`
  };
}

function isGitCicdReadinessItemKey(
  value: string | null | undefined
): value is GitCicdReadinessItemKey {
  return typeof value === "string" && readinessKeys.has(value as GitCicdReadinessItemKey);
}

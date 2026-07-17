import type { GitCicdReadinessItemKey } from "@sketchcatch/types";

const readinessKeys = new Set<GitCicdReadinessItemKey>([
  "approved_apply_plan",
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
  readonly reason: "approved_apply_plan";
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

export function createPendingCicdReturn(projectId: string): PendingCicdReturn {
  return { projectId, reason: "approved_apply_plan" };
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

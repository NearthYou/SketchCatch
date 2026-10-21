import type {
  ApplicationReleaseStatus,
  GitCicdPipelineRun,
  TerraformOutput
} from "../../../../packages/types/src";

export type SafeDeploymentLink = {
  readonly kind: "web" | "api";
  readonly label: "Web entry point" | "API endpoint";
  readonly url: string;
};

export type DeploymentOutputState = {
  readonly deploymentId: string | null;
  readonly outputs: readonly TerraformOutput[];
};

export type DeploymentOutputAction =
  | {
      readonly type: "clear";
      readonly deploymentId: string | null;
    }
  | {
      readonly type: "loaded";
      readonly deploymentId: string;
      readonly outputs: readonly TerraformOutput[];
    };

export const initialDeploymentOutputState: DeploymentOutputState = {
  deploymentId: null,
  outputs: []
};

const WEB_OUTPUT_NAMES = ["cloudfronturl", "staticsiteurl", "appurl"] as const;
const API_OUTPUT_NAMES = ["apibaseurl", "apiurl"] as const;

export function getSafeDeploymentLinks(
  outputs: readonly TerraformOutput[]
): SafeDeploymentLink[] {
  const eligibleOutputs = outputs.filter((output) => !output.sensitive);
  const webUrl = findFirstSafeUrl(eligibleOutputs, WEB_OUTPUT_NAMES);
  const apiUrl = findFirstSafeUrl(eligibleOutputs, API_OUTPUT_NAMES);
  const links: SafeDeploymentLink[] = [];

  if (webUrl !== null) {
    links.push({ kind: "web", label: "Web entry point", url: webUrl });
  }
  if (apiUrl !== null && apiUrl !== webUrl) {
    links.push({ kind: "api", label: "API endpoint", url: apiUrl });
  }

  return links;
}

export function getManagedDeploymentLinks(
  outputs: readonly TerraformOutput[],
  applicationReleaseStatus: ApplicationReleaseStatus | null
): SafeDeploymentLink[] {
  const links = getSafeDeploymentLinks(outputs);
  const applicationReleaseFinished =
    applicationReleaseStatus !== null &&
    ["succeeded", "partially_failed", "partially_cancelled"].includes(
      applicationReleaseStatus
    );

  return applicationReleaseFinished ? links : links.filter((link) => link.kind !== "web");
}

export function getSafePipelineRunLinks(
  run: Pick<GitCicdPipelineRun, "apiUrl" | "appUrl" | "release"> | null
): SafeDeploymentLink[] {
  if (!run) {
    return [];
  }

  const links: SafeDeploymentLink[] = [];
  const releaseOutputUrl =
    run.release?.outputUrl &&
    ["succeeded", "partially_failed", "partially_cancelled"].includes(run.release.status) &&
    isSafeHttpsUrl(run.release.outputUrl)
      ? run.release.outputUrl
      : null;
  const webUrl = releaseOutputUrl ?? run.appUrl;
  if (webUrl && isSafeHttpUrl(webUrl)) {
    links.push({ kind: "web", label: "Web entry point", url: webUrl });
  }
  if (run.apiUrl && run.apiUrl !== webUrl && isSafeHttpUrl(run.apiUrl)) {
    links.push({ kind: "api", label: "API endpoint", url: run.apiUrl });
  }
  return links;
}

export function reduceDeploymentOutputState(
  _state: DeploymentOutputState,
  action: DeploymentOutputAction
): DeploymentOutputState {
  if (action.type === "clear") {
    return { deploymentId: action.deploymentId, outputs: [] };
  }
  return {
    deploymentId: action.deploymentId,
    outputs: action.outputs.filter(
      (output) => output.deploymentId === action.deploymentId
    )
  };
}

export function getVisibleDeploymentOutputs(
  state: DeploymentOutputState,
  selectedDeploymentId: string
): readonly TerraformOutput[] {
  return state.deploymentId === selectedDeploymentId ? state.outputs : [];
}

function findFirstSafeUrl(
  outputs: readonly TerraformOutput[],
  namesByPrecedence: readonly string[]
): string | null {
  for (const name of namesByPrecedence) {
    const output = outputs.find((candidate) => normalizeOutputName(candidate.name) === name);
    if (!output || typeof output.value !== "string") {
      continue;
    }

    const url = output.value;
    if (isSafeHttpUrl(url)) {
      return url;
    }
  }

  return null;
}

function normalizeOutputName(name: string): string {
  return name.replaceAll("_", "").toLowerCase();
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

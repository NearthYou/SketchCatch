import type { TerraformOutput } from "../../../../packages/types/src";

export type SafeDeploymentLink = {
  readonly kind: "web" | "api";
  readonly label: "Web entry point" | "API endpoint";
  readonly url: string;
};

const WEB_OUTPUT_NAMES = ["staticsiteurl", "appurl"] as const;
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
  if (apiUrl !== null) {
    links.push({ kind: "api", label: "API endpoint", url: apiUrl });
  }

  return links;
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
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

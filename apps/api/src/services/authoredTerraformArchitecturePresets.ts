import { isDeepStrictEqual } from "node:util";
import type { DiagramJson } from "@sketchcatch/types";
import { AUDIENCE_LIVE_CHECK_MANUAL_DIAGRAM } from "./audienceLiveCheckManualDiagram.js";
import { AUDIENCE_LIVE_CHECK_TERRAFORM_SOURCE } from "./audienceLiveCheckTerraformSource.js";

const AUDIENCE_LIVE_CHECK_PROMPTS = new Set([
  "데모용 실시간 배포 사이트를 배포하고 싶어",
  "데모용 실시간 배포 사이트의 다이어그램 만들어줘."
]);
export type AuthoredTerraformArchitecturePreset = {
  readonly id: "audience-live-check";
  readonly title: string;
};

const AUDIENCE_LIVE_CHECK_PRESET: AuthoredTerraformArchitecturePreset = {
  id: "audience-live-check",
  title: "데모용 실시간 배포 사이트"
};
const AUDIENCE_LIVE_CHECK_DIAGRAM = createCanonicalDiagram();
const AUDIENCE_LIVE_CHECK_TERRAFORM_CONTENT = createTerraformContentSignature(
  AUDIENCE_LIVE_CHECK_DIAGRAM
);

export function findAuthoredTerraformArchitecturePreset(
  prompt: string
): AuthoredTerraformArchitecturePreset | null {
  const normalizedPrompt = prompt.normalize("NFKC").replace(/\s+/gu, " ").trim();

  return AUDIENCE_LIVE_CHECK_PROMPTS.has(normalizedPrompt)
    ? AUDIENCE_LIVE_CHECK_PRESET
    : null;
}

export function createAuthoredTerraformArchitectureDiagram(
  preset: AuthoredTerraformArchitecturePreset
): DiagramJson {
  if (preset.id !== AUDIENCE_LIVE_CHECK_PRESET.id) {
    throw new Error(`Unknown authored Terraform architecture preset: ${preset.id}`);
  }

  return structuredClone(AUDIENCE_LIVE_CHECK_DIAGRAM);
}

export function renderAuthoredTerraformArchitectureSource(
  diagramJson: DiagramJson
): string | undefined {
  return isDeepStrictEqual(
    createTerraformContentSignature(diagramJson),
    AUDIENCE_LIVE_CHECK_TERRAFORM_CONTENT
  )
    ? getAudienceLiveCheckTerraformSource()
    : undefined;
}

function createTerraformContentSignature(diagramJson: DiagramJson): unknown {
  return {
    nodes: diagramJson.nodes.map(
      ({
        iconUrl: _iconUrl,
        locked: _locked,
        position: _position,
        size: _size,
        style: _style,
        zIndex: _zIndex,
        ...terraformNode
      }) => terraformNode
    ),
    edges: diagramJson.edges,
    ...(diagramJson.variables ? { variables: diagramJson.variables } : {})
  };
}
function getAudienceLiveCheckTerraformSource(): string {
  return AUDIENCE_LIVE_CHECK_TERRAFORM_SOURCE;
}

function createCanonicalDiagram(): DiagramJson {
  return structuredClone(AUDIENCE_LIVE_CHECK_MANUAL_DIAGRAM);
}
import { isDeepStrictEqual } from "node:util";
import type {
  DiagramJson,
  TerraformDiagramChangeProposal
} from "@sketchcatch/types";
import { AUDIENCE_LIVE_CHECK_TERRAFORM_SOURCE } from "./audienceLiveCheckTerraformSource.js";
import { syncTerraformToDiagramJson } from "./terraform/terraform-to-diagram.js";

const AUDIENCE_LIVE_CHECK_PROMPT = "데모용 실시간 배포 사이트를 배포하고 싶어";
export type AuthoredTerraformArchitecturePreset = {
  readonly id: "audience-live-check";
  readonly title: string;
};

const AUDIENCE_LIVE_CHECK_PRESET: AuthoredTerraformArchitecturePreset = {
  id: "audience-live-check",
  title: "데모용 실시간 배포 사이트"
};
const AUDIENCE_LIVE_CHECK_DIAGRAM = createCanonicalDiagram();

export function findAuthoredTerraformArchitecturePreset(
  prompt: string
): AuthoredTerraformArchitecturePreset | null {
  const normalizedPrompt = prompt.normalize("NFKC").replace(/\s+/gu, " ").trim();

  return normalizedPrompt === AUDIENCE_LIVE_CHECK_PROMPT
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
  return isDeepStrictEqual(diagramJson, AUDIENCE_LIVE_CHECK_DIAGRAM)
    ? getAudienceLiveCheckTerraformSource()
    : undefined;
}

function getAudienceLiveCheckTerraformSource(): string {
  return AUDIENCE_LIVE_CHECK_TERRAFORM_SOURCE;
}

function createCanonicalDiagram(): DiagramJson {
  const source = getAudienceLiveCheckTerraformSource();
  const emptyDiagram: DiagramJson = {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const syncResult = syncTerraformToDiagramJson(emptyDiagram, source);
  const blockingDiagnostic = syncResult.diagnostics.find(
    (diagnostic) => diagnostic.severity === "error"
  );
  if (blockingDiagnostic) {
    throw new Error(`Invalid authored audience-live-check Terraform: ${blockingDiagnostic.message}`);
  }

  const createProposals = (syncResult.proposals ?? []).filter(
    (
      proposal
    ): proposal is Extract<TerraformDiagramChangeProposal, { kind: "create_candidate" }> =>
      proposal.kind === "create_candidate"
  );
  if (createProposals.length === 0) {
    throw new Error("Authored audience-live-check Terraform produced no diagram resources");
  }

  return {
    nodes: createProposals.map((proposal, index) => ({
      id: proposal.nodeId ??
        `authored-audience-live-check-${proposal.identity.resourceType}-${proposal.identity.resourceName}`,
      type: proposal.identity.resourceType,
      kind: "resource" as const,
      position: proposal.position ?? {
        x: (index % 6) * 180,
        y: Math.floor(index / 6) * 140
      },
      size: { width: 124, height: 96 },
      label: proposal.identity.resourceName,
      locked: false,
      zIndex: 0,
      ...(proposal.metadata ? { metadata: proposal.metadata } : {}),
      parameters: proposal.parameters
    })),
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    presentation: { geometryPolicy: "catalog-normalized" }
  };
}

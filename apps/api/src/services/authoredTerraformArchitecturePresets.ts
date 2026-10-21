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
const AUDIENCE_LIVE_CHECK_TARGET_VALUE = readAudienceLiveCheckTargetValue(
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
  const targetValue = readAudienceLiveCheckTargetValue(diagramJson);

  if (targetValue === undefined || AUDIENCE_LIVE_CHECK_TARGET_VALUE === undefined) {
    return undefined;
  }

  const normalizedDiagram = structuredClone(diagramJson);

  if (!setAudienceLiveCheckTargetValue(normalizedDiagram, AUDIENCE_LIVE_CHECK_TARGET_VALUE)) {
    return undefined;
  }

  if (
    !isDeepStrictEqual(
      createTerraformContentSignature(normalizedDiagram),
      AUDIENCE_LIVE_CHECK_TERRAFORM_CONTENT
    )
  ) {
    return undefined;
  }

  return getAudienceLiveCheckTerraformSource().replace(
    /(\btarget_value\s*=\s*)50\b/u,
    `$1${targetValue}`
  );
}

/** gg: 데모 Board의 Auto Scaling 목표값만 바뀌면 나머지 검증된 Terraform을 그대로 보존합니다. */
function readAudienceLiveCheckTargetValue(diagramJson: DiagramJson): number | undefined {
  const scalingPolicy = diagramJson.nodes.find(
    (node) => node.parameters?.resourceType === "aws_appautoscaling_policy"
  );
  const configurations = scalingPolicy?.parameters?.values?.[
    "targetTrackingScalingPolicyConfiguration"
  ];
  const firstConfiguration = Array.isArray(configurations) ? configurations[0] : undefined;
  const targetValue =
    firstConfiguration && typeof firstConfiguration === "object"
      ? (firstConfiguration as Record<string, unknown>)["targetValue"]
      : undefined;

  return typeof targetValue === "number" && Number.isFinite(targetValue) && targetValue > 0
    ? targetValue
    : undefined;
}

function setAudienceLiveCheckTargetValue(diagramJson: DiagramJson, targetValue: number): boolean {
  const scalingPolicy = diagramJson.nodes.find(
    (node) => node.parameters?.resourceType === "aws_appautoscaling_policy"
  );
  const configurations = scalingPolicy?.parameters?.values?.[
    "targetTrackingScalingPolicyConfiguration"
  ];
  const firstConfiguration = Array.isArray(configurations) ? configurations[0] : undefined;

  if (!firstConfiguration || typeof firstConfiguration !== "object") {
    return false;
  }

  (firstConfiguration as Record<string, unknown>)["targetValue"] = targetValue;
  return true;
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

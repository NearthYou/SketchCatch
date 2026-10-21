import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import {
  prepareWorkspaceTerraformSource,
  WorkspaceTerraformPreparationError
} from "./workspace-terraform-preparation";

const emptyDiagram: DiagramJson = {
  edges: [],
  nodes: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

// 배포 준비가 오래된 Terraform보다 현재 Board 값을 우선하는지 재현합니다.
function scalingDiagram(targetValue: number): DiagramJson {
  return {
    edges: [],
    nodes: [
      {
        id: "requests",
        type: "APPLICATION_AUTO_SCALING_POLICY",
        kind: "resource",
        position: { x: 0, y: 0 },
        size: { width: 96, height: 96 },
        label: "요청 기준 자동 확장",
        locked: false,
        zIndex: 1,
        parameters: {
          fileName: "main.tf",
          resourceName: "requests",
          resourceType: "APPLICATION_AUTO_SCALING_POLICY",
          values: {
            targetTrackingScalingPolicyConfiguration: {
              targetValue
            }
          }
        }
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

test("immediate deployment regenerates stale Terraform from the current Board before syncing", async () => {
  const currentDiagram = scalingDiagram(5);
  const staleTerraformCode = `resource "aws_appautoscaling_policy" "requests" {
  target_tracking_scaling_policy_configuration {
    target_value = 50
  }
}`;
  const generatedTerraformCode = staleTerraformCode.replace(
    "target_value = 50",
    "target_value = 5"
  );
  let generated = false;

  const prepared = await prepareWorkspaceTerraformSource(
    {
      diagramJson: currentDiagram,
      terraformFiles: [{ fileName: "main.tf", terraformCode: staleTerraformCode }]
    },
    {
      generate: async (diagramJson) => {
        generated = true;
        assert.deepEqual(
          diagramJson.nodes[0]?.parameters?.values.targetTrackingScalingPolicyConfiguration,
          { targetValue: 5 }
        );
        return { architectureDiagnostics: [], terraformCode: generatedTerraformCode };
      },
      sync: async ({ diagramJson, terraformFiles }) => {
        const terraformCode = terraformFiles?.[0]?.terraformCode ?? "";

        return {
          diagnostics: [],
          diagramJson: terraformCode.includes("target_value = 50")
            ? scalingDiagram(50)
            : diagramJson,
          preservedResourceAddresses: [],
          proposals: []
        };
      },
      validate: async () => ({ diagnostics: [] })
    }
  );

  assert.equal(generated, true);
  assert.match(prepared.terraformCode, /target_value\s*=\s*5/u);
  assert.doesNotMatch(prepared.terraformCode, /target_value\s*=\s*50/u);
  assert.deepEqual(
    prepared.diagramJson.nodes[0]?.parameters?.values.targetTrackingScalingPolicyConfiguration,
    { targetValue: 5 }
  );
});

test("regenerates saved Terraform files without a mounted editor component", async () => {
  let generated = false;
  const prepared = await prepareWorkspaceTerraformSource(
    {
      diagramJson: emptyDiagram,
      terraformFiles: [
        {
          fileName: "main.tf",
          terraformCode: 'resource "aws_s3_bucket" "assets" {}'
        }
      ]
    },
    {
      generate: async () => {
        generated = true;
        return {
          architectureDiagnostics: [],
          terraformCode: 'resource "aws_s3_bucket" "assets" {}'
        };
      },
      sync: async ({ diagramJson }) => ({
        diagnostics: [],
        diagramJson,
        preservedResourceAddresses: [],
        proposals: []
      }),
      validate: async () => ({ diagnostics: [] })
    }
  );

  assert.equal(generated, true);
  assert.equal(prepared.terraformFiles[0]?.fileName, "main.tf");
  assert.match(prepared.terraformCode, /aws_s3_bucket/);
});

test("generates Terraform from the current diagram when no working files exist", async () => {
  let generated = false;
  const prepared = await prepareWorkspaceTerraformSource(
    { diagramJson: emptyDiagram, terraformFiles: [] },
    {
      generate: async () => {
        generated = true;
        return {
          architectureDiagnostics: [],
          terraformCode: 'resource "aws_s3_bucket" "generated" {}'
        };
      },
      sync: async ({ diagramJson }) => ({
        diagnostics: [],
        diagramJson,
        preservedResourceAddresses: [],
        proposals: []
      }),
      validate: async () => ({ diagnostics: [] })
    }
  );

  assert.equal(generated, true);
  assert.match(prepared.terraformCode, /aws_s3_bucket/);
});

test("stops generated Terraform preparation when architecture generation reports an error", async () => {
  let validated = false;
  let synchronized = false;

  await assert.rejects(
    () =>
      prepareWorkspaceTerraformSource(
        { diagramJson: emptyDiagram, terraformFiles: [] },
        {
          generate: async () => ({
            architectureDiagnostics: [
              {
                code: "architecture.unsupported",
                message: "unsupported resource",
                relatedNodeIds: [],
                remediation: [],
                resourceNodeId: "s3",
                ruleId: "unsupported",
                severity: "error",
                source: "architecture-rule",
                summary: "unsupported resource"
              }
            ],
            terraformCode: 'resource "aws_s3_bucket" "generated" {}'
          }),
          sync: async ({ diagramJson }) => {
            synchronized = true;
            return {
              diagnostics: [],
              diagramJson,
              preservedResourceAddresses: [],
              proposals: []
            };
          },
          validate: async () => {
            validated = true;
            return { diagnostics: [] };
          }
        }
      ),
    (error: unknown) =>
      error instanceof WorkspaceTerraformPreparationError &&
      error.architectureDiagnostics.length === 1
  );
  assert.equal(validated, false);
  assert.equal(synchronized, false);
});

test("stops preparation before sync when Terraform validation fails", async () => {
  let synchronized = false;

  await assert.rejects(
    () =>
      prepareWorkspaceTerraformSource(
        {
          diagramJson: emptyDiagram,
          terraformFiles: [{ fileName: "main.tf", terraformCode: "invalid" }]
        },
        {
          generate: async () => ({ architectureDiagnostics: [], terraformCode: "" }),
          sync: async ({ diagramJson }) => {
            synchronized = true;
            return {
              diagnostics: [],
              diagramJson,
              preservedResourceAddresses: [],
              proposals: []
            };
          },
          validate: async () => ({
            diagnostics: [
              {
                code: "terraform.syntax",
                message: "invalid syntax",
                severity: "error"
              }
            ]
          })
        }
      ),
    (error: unknown) =>
      error instanceof WorkspaceTerraformPreparationError && error.diagnostics.length === 1
  );
  assert.equal(synchronized, false);
});

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

test("prepares saved Terraform files without a mounted editor component", async () => {
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
        return { architectureDiagnostics: [], terraformCode: "" };
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

  assert.equal(generated, false);
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

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResourceItem } from "@sketchcatch/types";
import {
  createTerraformResourceValidationCandidates,
  findMissingRequiredPanelParameters,
  renderTerraformResourceValidationAuditMarkdown,
  type TerraformAuditParameterDefinition,
  type TerraformResourceValidationAuditReport,
  type TerraformSchemaBlock
} from "./terraform-resource-validation-audit.js";

test("createTerraformResourceValidationCandidates keeps enabled AWS catalog items only", () => {
  const catalog: ResourceItem[] = [
    makeResourceItem({ id: "aws-vpc", type: "aws_vpc" }),
    makeResourceItem({ id: "design-group", type: "design_group" }),
    makeResourceItem({ enabled: false, id: "aws-subnet", type: "aws_subnet" }),
    makeResourceItem({
      id: "aws-ami",
      terraformBlockType: "data",
      type: "aws_ami"
    })
  ];

  assert.deepEqual(createTerraformResourceValidationCandidates(catalog), [
    {
      definitionId: "aws-vpc",
      enabled: true,
      label: "AWS VPC",
      name: "aws-vpc",
      terraformBlockType: "resource",
      terraformResourceType: "aws_vpc"
    },
    {
      definitionId: "aws-ami",
      enabled: true,
      label: "AWS AMI",
      name: "aws-ami",
      terraformBlockType: "data",
      terraformResourceType: "aws_ami"
    }
  ]);
});

test("findMissingRequiredPanelParameters reports provider-required fields absent from the panel", () => {
  const schema: TerraformSchemaBlock = {
    attributes: {
      cidr_block: { required: true },
      tags: { required: false }
    },
    block_types: {
      origin: {
        block: {
          attributes: {
            domain_name: { required: true },
            origin_id: { required: true }
          }
        },
        min_items: 1
      }
    }
  };
  const definitions: TerraformAuditParameterDefinition[] = [
    makeParameterDefinition({
      name: "cidrBlock",
      terraformName: "cidr_block"
    }),
    makeParameterDefinition({
      children: [
        makeParameterDefinition({
          name: "domainName",
          terraformName: "domain_name"
        })
      ],
      inputKind: "nested-block",
      name: "origin",
      terraformName: "origin",
      type: "object"
    })
  ];

  assert.deepEqual(findMissingRequiredPanelParameters(schema, definitions), ["origin.origin_id"]);
});

test("renderTerraformResourceValidationAuditMarkdown groups resources by audit status", () => {
  const report: TerraformResourceValidationAuditReport = {
    providerVersion: "6.51.0",
    results: [
      {
        definitionId: "aws-vpc",
        dependencyResourceTypes: [],
        diagnostics: [],
        missingParameters: [],
        status: "validate_passed",
        terraformBlockType: "resource",
        terraformResourceType: "aws_vpc",
        validateExitCode: 0
      },
      {
        definitionId: "aws-cloudfront-distribution",
        dependencyResourceTypes: [],
        diagnostics: ["The argument \"origin\" is required."],
        missingParameters: ["origin"],
        status: "parameter_panel_gap",
        terraformBlockType: "resource",
        terraformResourceType: "aws_cloudfront_distribution",
        validateExitCode: 1
      }
    ]
  };

  const markdown = renderTerraformResourceValidationAuditMarkdown(report);

  assert.match(markdown, /## Validate 통과 \(1\)/);
  assert.match(markdown, /aws-vpc \(resource\.aws_vpc\)/);
  assert.match(markdown, /## 파라미터 추가 필요 \(1\)/);
  assert.match(markdown, /aws-cloudfront-distribution/);
  assert.match(markdown, /missing: origin/);
});

function makeResourceItem(input: {
  readonly enabled?: boolean | undefined;
  readonly id: string;
  readonly terraformBlockType?: "data" | "resource" | undefined;
  readonly type: string;
}): ResourceItem {
  return {
    area: "network",
    cloudProvider: "aws",
    enabled: input.enabled ?? true,
    iconUrl: "/icon.svg",
    id: input.id,
    name: input.id,
    nodeDefaults: {
      label: input.type
        .split("_")
        .map((part) => part.toUpperCase())
        .join(" "),
      ...(input.terraformBlockType ? { terraformBlockType: input.terraformBlockType } : {}),
      size: { height: 96, width: 124 },
      type: input.type
    }
  };
}

function makeParameterDefinition(
  input: Partial<TerraformAuditParameterDefinition> &
    Pick<TerraformAuditParameterDefinition, "name" | "terraformName">
): TerraformAuditParameterDefinition {
  return {
    computed: false,
    inputKind: "text",
    label: input.name,
    optional: false,
    required: true,
    sensitive: false,
    type: "string",
    ...input
  };
}

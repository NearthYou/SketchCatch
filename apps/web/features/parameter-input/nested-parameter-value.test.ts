import assert from "node:assert/strict";
import test from "node:test";
import type { ResourceNodeParameters } from "../../../../packages/types/src";
import type { ParameterCatalog, ParameterCatalogDefinition } from "./catalog";
import { validateParameters } from "./validation";
import {
  readSingleNestedParameterValue,
  writeSingleNestedParameterValue
} from "./nested-parameter-value";

test("single nested parameter fields read Terraform parser arrays as one editable block", () => {
  const parsedTerraformValue = [
    {
      predefinedMetricSpecification: [
        { predefinedMetricType: "ECSServiceAverageCPUUtilization" }
      ],
      targetValue: 50
    }
  ];

  assert.deepEqual(readSingleNestedParameterValue(parsedTerraformValue), parsedTerraformValue[0]);
  assert.deepEqual(
    writeSingleNestedParameterValue(parsedTerraformValue, {
      ...parsedTerraformValue[0],
      targetValue: 5
    }),
    [
      {
        predefinedMetricSpecification: [
          { predefinedMetricType: "ECSServiceAverageCPUUtilization" }
        ],
        targetValue: 5
      }
    ]
  );
});

test("Terraform singleton nested-block arrays remain valid parameter values", () => {
  const definitions: ParameterCatalogDefinition[] = [
    {
      name: "targetTrackingScalingPolicyConfiguration",
      terraformName: "target_tracking_scaling_policy_configuration",
      label: "Target tracking configuration",
      type: "object",
      required: true,
      optional: false,
      computed: false,
      sensitive: false,
      inputKind: "nested-block",
      children: [
        {
          name: "targetValue",
          terraformName: "target_value",
          label: "Target value",
          type: "number",
          required: true,
          optional: false,
          computed: false,
          sensitive: false,
          inputKind: "number"
        }
      ]
    }
  ];
  const params: ResourceNodeParameters = {
    terraformBlockType: "resource",
    resourceType: "aws_appautoscaling_policy",
    resourceName: "ecs_service_requests",
    fileName: "main.tf",
    values: {
      targetTrackingScalingPolicyConfiguration: [{ targetValue: 50 }]
    }
  };
  const catalog = {
    provider: "aws",
    generatedAt: "2026-07-24T00:00:00.000Z",
    source: "test",
    resources: { aws_appautoscaling_policy: definitions }
  } as ParameterCatalog;

  assert.deepEqual(
    validateParameters(params, definitions, [], "ecs-service-requests-node", catalog),
    {
      invalid: false,
      metadataErrors: {},
      parameterErrors: {}
    }
  );

  const invalidResult = validateParameters(
    {
      ...params,
      values: { targetTrackingScalingPolicyConfiguration: [{}] }
    },
    definitions,
    [],
    "ecs-service-requests-node",
    catalog
  );

  assert.equal(invalidResult.invalid, true);
  assert.ok(
    "targetTrackingScalingPolicyConfiguration.targetValue" in
      invalidResult.parameterErrors
  );
  assert.equal(
    invalidResult.parameterErrors[
      "targetTrackingScalingPolicyConfiguration.0.targetValue"
    ],
    undefined
  );
});

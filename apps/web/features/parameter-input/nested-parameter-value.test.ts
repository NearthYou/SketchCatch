import assert from "node:assert/strict";
import test from "node:test";
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

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createArchitectureRequirementNormalizerInstructions,
  createOpenAiRequirementNormalizerProvider,
  parseArchitectureIntentPlan
} from "./aiArchitectureRequirementNormalizer.js";

test("parseArchitectureIntentPlan drops descriptive pseudo-region values", () => {
  const plan = parseArchitectureIntentPlan({
    intent: "global_dynamic_application",
    region: "multi-region-global"
  });

  assert.deepEqual(plan, { intent: "global_dynamic_application" });
});

test("OpenAI requirement normalizer uses a Structured Outputs compatible wire schema", async () => {
  let capturedFormat: unknown;
  const provider = createOpenAiRequirementNormalizerProvider({
    client: {
      responses: {
        parse: async (request) => {
          capturedFormat = request.text.format;

          return {
            output_parsed: {
              intent: "dynamic_web_application",
              region: null,
              patternIds: ["alb-asg-ec2"],
              requiredResources: ["LOAD_BALANCER", "AUTO_SCALING_GROUP", "EC2"],
              resourceQuantities: [{ resourceType: "EC2", quantity: 3 }],
              forbiddenCapabilities: ["file_upload"],
              runtimeTopology: {
                trafficEntry: "LOAD_BALANCER",
                compute: "EC2",
                computeCount: 3,
                placement: "private_subnets",
                spreadAcrossPrivateSubnets: true,
                autoScaling: true
              },
              database: null,
              availability: null,
              amazonQBrief: null
            }
          };
        }
      }
    },
    model: "test-openai-normalizer"
  });

  const response = await provider.generate({
    target: "architecture_requirement_normalization",
    instructions: createArchitectureRequirementNormalizerInstructions(),
    prompt: "Create an ALB, an Auto Scaling Group, and three EC2 instances in private subnets.",
    payload: {}
  });

  const format = capturedFormat as {
    readonly schema?: {
      readonly properties?: Record<string, unknown>;
      readonly required?: readonly string[];
    };
  };
  const propertyNames = Object.keys(format.schema?.properties ?? {}).sort();

  assert.deepEqual([...(format.schema?.required ?? [])].sort(), propertyNames);
  assert.doesNotMatch(JSON.stringify(capturedFormat), /"propertyNames"/);
  assert.deepEqual(JSON.parse(response.text), {
    intent: "dynamic_web_application",
    patternIds: ["alb-asg-ec2"],
    requiredResources: ["LOAD_BALANCER", "AUTO_SCALING_GROUP", "EC2"],
    resourceQuantities: { EC2: 3 },
    forbiddenCapabilities: ["file_upload"],
    runtimeTopology: {
      trafficEntry: "LOAD_BALANCER",
      compute: "EC2",
      computeCount: 3,
      placement: "private_subnets",
      spreadAcrossPrivateSubnets: true,
      autoScaling: true
    }
  });
});

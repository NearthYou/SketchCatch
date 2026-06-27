import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { buildApp } from "../app.js";

process.env.NODE_ENV = "test";

const preDeploymentSuggestionResponseSchema = z.object({
  findings: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      severity: z.string(),
      resourceId: z.string().optional()
    })
  ),
  suggestions: z.array(
    z.object({
      id: z.string(),
      findingId: z.string().optional(),
      title: z.string(),
      targetResourceId: z.string().optional(),
      action: z.string(),
      expectedImpact: z.object({
        cost: z.string(),
        security: z.string(),
        reliability: z.string()
      }),
      explanation: z.string()
    })
  )
});

test("POST /api/ai/pre-deployment-check links open SSH findings to reviewable suggestions", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/pre-deployment-check",
    payload: {
      architectureJson: {
        nodes: [
          {
            id: "sg-public-ssh",
            type: "SECURITY_GROUP",
            label: "Public SSH",
            positionX: 120,
            positionY: 180,
            config: {
              ingress: [
                {
                  protocol: "tcp",
                  port: 22,
                  cidr: "0.0.0.0/0"
                }
              ]
            }
          }
        ],
        edges: []
      }
    }
  });

  assert.equal(response.statusCode, 200);

  const body = preDeploymentSuggestionResponseSchema.parse(response.json());
  const finding = body.findings.find((item) => item.resourceId === "sg-public-ssh");

  if (finding === undefined) {
    assert.fail("open SSH finding should exist before checking its suggestion");
  }

  const suggestion = body.suggestions.find((item) => item.findingId === finding.id);

  assert.equal(finding.category, "security");
  assert.equal(finding.severity, "high");
  assert.equal(suggestion?.targetResourceId, "sg-public-ssh");
  assert.equal(suggestion?.action, "modify_resource");
  assert.equal(suggestion?.expectedImpact.security, "improve");

  await app.close();
});

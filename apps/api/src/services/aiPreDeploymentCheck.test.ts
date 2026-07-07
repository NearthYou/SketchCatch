import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckFinding } from "@sketchcatch/types";
import { analyzePreDeploymentCheck } from "./aiPreDeploymentCheck.js";

test("analyzePreDeploymentCheck merges Trivy security findings with existing policy findings", async () => {
  const trivyFinding: CheckFinding = {
    id: "trivy:aws-0107:security.tf:aws_security_group.open_ssh:13",
    category: "network",
    severity: "high",
    resourceId: "aws_security_group.open_ssh",
    sourceLocation: {
      fileName: "security.tf",
      line: 13,
      resourceAddress: "aws_security_group.open_ssh"
    },
    title: "Security groups should not allow unrestricted ingress to SSH or RDP from any IP address.",
    description: "Public SSH is exposed.",
    recommendation: "Restrict SSH to a trusted CIDR."
  };

  const result = await analyzePreDeploymentCheck(
    {
      architectureJson: {
        nodes: [
          {
            id: "sg-public-ssh",
            type: "SECURITY_GROUP",
            label: "Public SSH",
            positionX: 0,
            positionY: 0,
            config: {
              ingress: [
                {
                  protocol: "tcp",
                  port: 22,
                  cidr: "0.0.0.0/0"
                }
              ]
            }
          },
          {
            id: "ec2-backend",
            type: "EC2",
            label: "Backend",
            positionX: 200,
            positionY: 0,
            config: {}
          }
        ],
        edges: []
      },
      terraformFiles: [
        {
          fileName: "security.tf",
          terraformCode: "resource \"aws_security_group\" \"open_ssh\" {}"
        }
      ]
    },
    {
      terraformSecurityScanner: async () => [trivyFinding]
    }
  );

  assert.equal(result.findings[0]?.id, trivyFinding.id);
  assert.equal(result.findings.some((finding) => finding.id.startsWith("security-open-ssh")), false);
  assert.ok(result.findings.some((finding) => finding.category === "configuration"));
  assert.equal(
    result.checklist.find((item) => item.id === "security-open-ssh-check")?.status,
    "fail"
  );
});

test("analyzePreDeploymentCheck deduplicates repeated findings for the same resource and fix", async () => {
  const firstFinding: CheckFinding = {
    id: "trivy:aws-0171:main.tf:aws_s3_bucket.service_bucket:2",
    category: "security",
    severity: "high",
    resourceId: "aws_s3_bucket.service_bucket",
    sourceLocation: {
      fileName: "main.tf",
      line: 2,
      resourceAddress: "aws_s3_bucket.service_bucket"
    },
    title: "S3 버킷은 공개 접근을 허용하면 안 됩니다.",
    description: "S3 bucket may allow public access.",
    recommendation: "S3 Block Public Access를 활성화하세요."
  };
  const duplicateFinding: CheckFinding = {
    ...firstFinding,
    id: "trivy:aws-0172:main.tf:aws_s3_bucket.service_bucket:3",
    sourceLocation: {
      fileName: "main.tf",
      line: 3,
      resourceAddress: "aws_s3_bucket.service_bucket"
    }
  };

  const result = await analyzePreDeploymentCheck(
    {
      architectureJson: {
        nodes: [],
        edges: []
      },
      terraformFiles: [
        {
          fileName: "main.tf",
          terraformCode: "resource \"aws_s3_bucket\" \"service_bucket\" {}"
        }
      ]
    },
    {
      terraformSecurityScanner: async () => [firstFinding, duplicateFinding]
    }
  );

  assert.deepEqual(
    result.findings.map((finding) => finding.id),
    [firstFinding.id]
  );
  assert.deepEqual(
    result.checklist.find((item) => item.id === "security-open-ssh-check")?.relatedFindingIds,
    [firstFinding.id]
  );
  assert.deepEqual(
    result.suggestions.map((suggestion) => suggestion.findingId),
    [firstFinding.id]
  );
});

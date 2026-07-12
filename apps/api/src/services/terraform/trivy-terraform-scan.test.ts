import assert from "node:assert/strict";
import { test } from "node:test";
import { createInMemoryRuntimeCache } from "../../runtime-cache/index.js";
import {
  createCachedTerraformSecurityScanner,
  createTrivyIgnoreFileContents,
  disabledTrivyTerraformRuleIds,
  parseTrivyTerraformFindings,
  warmTrivyCheckBundle
} from "./trivy-terraform-scan.js";

test("cached Terraform scanner reuses findings for identical content", async () => {
  let scanCount = 0;
  const scanner = createCachedTerraformSecurityScanner({
    scan: async () => {
      scanCount += 1;
      return [];
    }
  });
  const input = {
    terraformFiles: [
      {
        fileName: "main.tf",
        terraformCode: 'resource "aws_vpc" "main" {}'
      }
    ]
  };

  await scanner(input);
  await scanner(input);

  assert.equal(scanCount, 1);
});

test("cached Terraform scanner reuses an explicit artifact SHA across file names", async () => {
  let scanCount = 0;
  const scanner = createCachedTerraformSecurityScanner({
    scan: async () => {
      scanCount += 1;
      return [];
    }
  });
  const artifactSha256 = "a".repeat(64);

  await scanner({
    artifactSha256,
    terraformFiles: [{ fileName: "editor.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}' }]
  });
  await scanner({
    artifactSha256,
    terraformFiles: [{ fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}' }]
  });

  assert.equal(scanCount, 1);
});

test("cached Terraform scanner expires findings after five-minute TTL", async () => {
  let now = 0;
  let scanCount = 0;
  const scanner = createCachedTerraformSecurityScanner({
    now: () => now,
    scan: async () => {
      scanCount += 1;
      return [];
    }
  });
  const input = {
    terraformFiles: [{ fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}' }]
  };

  await scanner(input);
  now = 5 * 60 * 1000 - 1;
  await scanner(input);
  now = 5 * 60 * 1000;
  await scanner(input);

  assert.equal(scanCount, 2);
});

test("cached Terraform scanner invalidates results when policy identity changes", async () => {
  let policyIdentity = "policy-v1";
  let scanCount = 0;
  const scanner = createCachedTerraformSecurityScanner({
    cacheKeySalt: () => policyIdentity,
    scan: async () => {
      scanCount += 1;
      return [];
    }
  });
  const input = {
    terraformFiles: [{ fileName: "main.tf", terraformCode: 'resource "aws_vpc" "main" {}' }]
  };

  await scanner(input);
  policyIdentity = "policy-v2";
  await scanner(input);

  assert.equal(scanCount, 2);
});

test("cached Terraform scanner coalesces concurrent scans for identical content", async () => {
  let releaseScan: (() => void) | undefined;
  let scanCount = 0;
  const scanner = createCachedTerraformSecurityScanner({
    scan: async () => {
      scanCount += 1;
      await new Promise<void>((resolve) => {
        releaseScan = resolve;
      });
      return [];
    }
  });
  const input = {
    terraformFiles: [{ fileName: "main.tf", terraformCode: 'resource "aws_iam_role" "app" {}' }]
  };

  const firstScan = scanner(input);
  const secondScan = scanner(input);
  await new Promise((resolve) => setImmediate(resolve));
  releaseScan?.();
  await Promise.all([firstScan, secondScan]);

  assert.equal(scanCount, 1);
});

test("cached Terraform scanners share findings through Runtime Cache", async () => {
  let scanCount = 0;
  const runtimeCache = createInMemoryRuntimeCache();
  const createScanner = () =>
    createCachedTerraformSecurityScanner({
      runtimeCache,
      scan: async () => {
        scanCount += 1;
        return [];
      }
    });
  const input = {
    terraformFiles: [
      {
        fileName: "main.tf",
        terraformCode: 'resource "aws_subnet" "public" {}'
      }
    ]
  };

  await createScanner()(input);
  await createScanner()(input);

  assert.equal(scanCount, 1);
});

test("warmTrivyCheckBundle runs a minimal Terraform scan", async () => {
  const scannedFiles: string[] = [];

  await warmTrivyCheckBundle(async ({ terraformFiles }) => {
    scannedFiles.push(...terraformFiles.map((file) => file.fileName));
    return [];
  });

  assert.deepEqual(scannedFiles, ["trivy-warmup.tf"]);
});

test("disables ALB and Auto Scaling Trivy rules through the generated ignore file", () => {
  const ignoreFileContents = createTrivyIgnoreFileContents();

  for (const ruleId of disabledTrivyTerraformRuleIds) {
    assert.match(ignoreFileContents, new RegExp(`^${ruleId}$`, "m"));
    assert.match(ignoreFileContents, new RegExp(`^AVD-${ruleId}$`, "m"));
  }
});

test("parseTrivyTerraformFindings maps failed Terraform misconfigurations to source locations", () => {
  const findings = parseTrivyTerraformFindings(
    JSON.stringify({
      Results: [
        {
          Target: "security.tf",
          Misconfigurations: [
            {
              ID: "AWS-0107",
              Title: "Security groups should not allow unrestricted ingress to SSH or RDP from any IP address.",
              Description: "Public SSH is exposed.",
              Resolution: "Set a trusted CIDR range.",
              Severity: "HIGH",
              Status: "FAIL",
              CauseMetadata: {
                FilePath: "security.tf",
                Resource: "aws_security_group.open_ssh",
                StartLine: 13
              }
            }
          ]
        }
      ]
    }),
    {
      writtenFiles: [
        {
          originalFileName: "security.tf",
          relativePath: "security.tf"
        }
      ]
    }
  );

  assert.equal(findings.length, 1);
  assert.equal(
    findings[0]?.id,
    "trivy:aws-0107:security.tf:aws_security_group.open_ssh:13"
  );
  assert.equal(findings[0]?.category, "network");
  assert.equal(findings[0]?.severity, "high");
  assert.equal(findings[0]?.resourceId, "aws_security_group.open_ssh");
  assert.equal(findings[0]?.title, "보안 그룹은 SSH/RDP를 전체 인터넷에 열면 안 됩니다.");
  assert.doesNotMatch(findings[0]?.description ?? "", /Public SSH|unrestricted ingress/i);
  assert.doesNotMatch(findings[0]?.recommendation ?? "", /trusted CIDR range/i);
  assert.deepEqual(findings[0]?.sourceLocation, {
    fileName: "security.tf",
    line: 13,
    resourceAddress: "aws_security_group.open_ssh"
  });
});

test("parseTrivyTerraformFindings localizes common Trivy rule text to Korean", () => {
  const findings = parseTrivyTerraformFindings(
    JSON.stringify({
      Results: [
        {
          Target: "main.tf",
          Misconfigurations: [
            {
              ID: "AVD-AWS-0028",
              Title: "aws_instance should activate session tokens for Instance Metadata Service.",
              Description: "Instance metadata service should use IMDSv2.",
              Resolution: "Enable metadata_options http_tokens required.",
              Severity: "HIGH",
              Status: "FAIL",
              CauseMetadata: {
                FilePath: "main.tf",
                Resource: "aws_instance.ec2_backend",
                StartLine: 22
              }
            },
            {
              ID: "AVD-AWS-0077",
              Title: "RDS Cluster and RDS Instance should have backup retention longer than default 1 day",
              Description: "Backup retention should be configured.",
              Resolution: "Set backup_retention_period.",
              Severity: "MEDIUM",
              Status: "FAIL",
              CauseMetadata: {
                FilePath: "main.tf",
                Resource: "aws_db_instance.rds_primary",
                StartLine: 41
              }
            },
            {
              ID: "AVD-AWS-0080",
              Title: "RDS encryption has not been enabled at a DB Instance level.",
              Description: "RDS storage should be encrypted.",
              Resolution: "Set storage_encrypted to true.",
              Severity: "HIGH",
              Status: "FAIL",
              CauseMetadata: {
                FilePath: "main.tf",
                Resource: "aws_db_instance.rds_primary",
                StartLine: 42
              }
            }
          ]
        }
      ]
    }),
    {
      writtenFiles: [
        {
          originalFileName: "main.tf",
          relativePath: "main.tf"
        }
      ]
    }
  );

  assert.equal(
    findings[0]?.title,
    "EC2 인스턴스는 인스턴스 메타데이터 서비스(IMDS) v2 세션 토큰을 요구해야 합니다."
  );
  assert.equal(findings[1]?.title, "RDS 백업 보존 기간은 기본 1일보다 길게 설정해야 합니다.");
  assert.equal(findings[2]?.title, "RDS DB 인스턴스 암호화를 활성화해야 합니다.");
  assert.doesNotMatch(findings.map((finding) => finding.title).join("\n"), /should|enabled|retention/i);
});

test("groups S3 Trivy rules by risk family while preserving rule evidence", () => {
  const findings = parseTrivyTerraformFindings(
    JSON.stringify({
      Results: [
        {
          Target: "main.tf",
          Misconfigurations: [
            createS3Misconfiguration("AWS-0086", "HIGH", "S3 Access block should block public ACL"),
            createS3Misconfiguration("AWS-0087", "HIGH", "S3 Access block should block public policy"),
            createS3Misconfiguration("AWS-0090", "MEDIUM", "S3 Data should be versioned"),
            createS3Misconfiguration("AWS-0091", "HIGH", "S3 Access Block should Ignore Public ACL"),
            createS3Misconfiguration(
              "AWS-0093",
              "HIGH",
              "S3 Access block should restrict public bucket to limit access"
            ),
            createS3Misconfiguration(
              "AWS-0132",
              "HIGH",
              "S3 encryption should use Customer Managed Keys"
            )
          ]
        }
      ]
    })
  );

  assert.equal(findings.length, 3);
  assert.deepEqual(
    findings.map((finding) => ({
      riskFamily: finding.riskFamily,
      severity: finding.severity,
      trivyRuleIds: finding.trivyRuleIds
    })),
    [
      {
        riskFamily: "S3_PUBLIC_ACCESS",
        severity: "high",
        trivyRuleIds: ["AWS-0086", "AWS-0087", "AWS-0091", "AWS-0093"]
      },
      {
        riskFamily: "S3_VERSIONING",
        severity: "medium",
        trivyRuleIds: ["AWS-0090"]
      },
      {
        riskFamily: "S3_KMS_ENCRYPTION",
        severity: "high",
        trivyRuleIds: ["AWS-0132"]
      }
    ]
  );
  const publicAccessFinding = findings[0];
  assert.match(publicAccessFinding?.title ?? "", /AWS-0086[\s\S]*AWS-0087[\s\S]*AWS-0091[\s\S]*AWS-0093/);
  assert.match(publicAccessFinding?.recommendation ?? "", /block_public_acls/);
  assert.match(publicAccessFinding?.recommendation ?? "", /block_public_policy/);
  assert.match(publicAccessFinding?.recommendation ?? "", /ignore_public_acls/);
  assert.match(publicAccessFinding?.recommendation ?? "", /restrict_public_buckets/);
});

test("parseTrivyTerraformFindings falls back to the Trivy result target when cause file path is missing", () => {
  const findings = parseTrivyTerraformFindings(
    JSON.stringify({
      Results: [
        {
          Target: "main.tf",
          Misconfigurations: [
            {
              ID: "AWS-0107",
              Title: "Security groups should not allow unrestricted ingress to SSH or RDP from any IP address.",
              Severity: "HIGH",
              Status: "FAIL",
              CauseMetadata: {
                Resource: "aws_security_group.open_ssh",
                StartLine: 8
              }
            }
          ]
        }
      ]
    }),
    {
      writtenFiles: [
        {
          originalFileName: "main.tf",
          relativePath: "main.tf"
        }
      ]
    }
  );

  assert.deepEqual(findings[0]?.sourceLocation, {
    fileName: "main.tf",
    line: 8,
    resourceAddress: "aws_security_group.open_ssh"
  });
});

test("parseTrivyTerraformFindings skips passing misconfigurations", () => {
  const findings = parseTrivyTerraformFindings(
    JSON.stringify({
      Results: [
        {
          Target: "main.tf",
          Misconfigurations: [
            {
              ID: "AWS-0001",
              Title: "Passing rule",
              Severity: "MEDIUM",
              Status: "PASS"
            }
          ]
        }
      ]
    })
  );

  assert.deepEqual(findings, []);
});

function createS3Misconfiguration(ID: string, Severity: string, Title: string) {
  return {
    ID,
    Title,
    Severity,
    Status: "FAIL",
    CauseMetadata: {
      FilePath: "main.tf",
      Resource: "aws_s3_bucket.s3_bucket",
      StartLine: 1
    }
  };
}

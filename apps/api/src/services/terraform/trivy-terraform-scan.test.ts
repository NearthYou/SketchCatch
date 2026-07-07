import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTrivyTerraformFindings } from "./trivy-terraform-scan.js";

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

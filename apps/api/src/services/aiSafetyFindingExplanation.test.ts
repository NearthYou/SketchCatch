import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckFinding } from "@sketchcatch/types";
import {
  createConfiguredOpenAiSafetyFindingExplanation,
  createFallbackSafetyFindingExplanation,
  createOpenAiSafetyFindingExplanation,
  type OpenAiSafetyResponsesClient
} from "./aiSafetyFindingExplanation.js";

process.env.NODE_ENV = "test";

test("createOpenAiSafetyFindingExplanation returns parsed OpenAI guidance with provider metadata", async () => {
  const parseRequests: unknown[] = [];
  const client: OpenAiSafetyResponsesClient = {
    responses: {
      parse: async (request) => {
        parseRequests.push(request);

        return {
          output_parsed: {
            riskSummary: "SSH가 인터넷에 공개되어 있습니다.",
            whyDangerous: "전체 인터넷에서 로그인 시도가 가능해 서버 장악 위험이 커집니다.",
            recommendedFix: "관리자 CIDR만 허용하거나 SSM Session Manager를 사용하세요.",
            terraformHint: "cidr_blocks 값을 관리자 CIDR로 바꾸세요.",
            verificationSteps: ["22번 포트가 0.0.0.0/0이 아닌지 확인", "검사를 다시 실행"],
            fallbackUsed: false
          }
        };
      }
    }
  };

  const explain = createOpenAiSafetyFindingExplanation({
    apiKey: "test-openai-api-key",
    client,
    model: "test-gpt"
  });
  const result = await explain(createFinding());

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.riskSummary, "SSH가 인터넷에 공개되어 있습니다.");
  assert.equal(result.providerMetadata?.provider, "openai");
  assert.equal(result.providerMetadata?.service, "openai_responses");
  assert.equal(result.providerMetadata?.model, "test-gpt");
  assert.equal(parseRequests.length, 1);
  assert.match(JSON.stringify(parseRequests[0]), /test-gpt/);
  assert.match(JSON.stringify(parseRequests[0]), /Do not decide severity/);
  assert.match(JSON.stringify(parseRequests[0]), /security-open-ssh-sg-app/);
});

test("createConfiguredOpenAiSafetyFindingExplanation creates client with timeout and model", async () => {
  const clientOptions: unknown[] = [];
  const parseRequests: unknown[] = [];
  const explain = createConfiguredOpenAiSafetyFindingExplanation({
    apiKey: "test-openai-api-key",
    model: "configured-gpt",
    createClient: (options) => {
      clientOptions.push(options);

      return {
        responses: {
          parse: async (request) => {
            parseRequests.push(request);

            return {
              output_parsed: {
                riskSummary: "RDS가 public으로 열려 있습니다.",
                whyDangerous: "DB endpoint가 외부 공격면이 됩니다.",
                recommendedFix: "public 접근을 끄고 private subnet에 둡니다.",
                terraformHint: null,
                verificationSteps: ["publicly_accessible false 확인"],
                fallbackUsed: false
              }
            };
          }
        }
      };
    }
  });

  const result = await explain(createFinding({ id: "security-public-rds-db", title: "public RDS" }));

  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(clientOptions, [
    {
      apiKey: "test-openai-api-key",
      timeout: 10_000,
      maxRetries: 0
    }
  ]);
  assert.match(JSON.stringify(parseRequests[0]), /configured-gpt/);
});

test("createOpenAiSafetyFindingExplanation falls back when OpenAI response is invalid", async () => {
  const explain = createOpenAiSafetyFindingExplanation({
    apiKey: "test-openai-api-key",
    client: {
      responses: {
        parse: async () => ({ output_parsed: { riskSummary: "safe to deploy", fallbackUsed: false } })
      }
    }
  });

  const result = await explain(createFinding());

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "invalid_response");
});

test("createOpenAiSafetyFindingExplanation falls back without exposing provider errors", async () => {
  const explain = createOpenAiSafetyFindingExplanation({
    apiKey: "test-openai-api-key",
    client: {
      responses: {
        parse: async () => {
          throw new Error("raw provider message must not leak");
        }
      }
    }
  });

  const result = await explain(createFinding());

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "provider_error");
  assert.doesNotMatch(JSON.stringify(result), /raw provider message/);
});

test("createConfiguredOpenAiSafetyFindingExplanation uses fallback when key is missing", async () => {
  const explain = createConfiguredOpenAiSafetyFindingExplanation({ apiKey: "" });
  const result = await explain(createFinding());

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "missing_api_key");
});

test("createFallbackSafetyFindingExplanation explains public SSH with deterministic guidance", () => {
  const explanation = createFallbackSafetyFindingExplanation(
    createFinding({
      id: "security-open-ssh-sg-app",
      title: "SSH is open to 0.0.0.0/0",
      description: "Port 22 allows 0.0.0.0/0"
    })
  );

  assert.equal(explanation.fallbackUsed, true);
  assert.equal(explanation.fallbackReason, "missing_api_key");
  assert.match(explanation.riskSummary, /SSH/);
  assert.match(explanation.recommendedFix, /Session Manager|CIDR/);
  assert.doesNotMatch(explanation.whyDangerous, /Anyone on the internet|compromised/i);
  assert.equal(explanation.verificationSteps.length >= 2, true);
  assert.equal(explanation.providerMetadata?.provider, "fallback");
  assert.equal(explanation.providerMetadata?.service, "rule_fallback");
  assert.equal(explanation.providerMetadata?.billingMode, "disabled");
  assert.equal(explanation.providerMetadata?.routeTarget, "safety_finding_explanation");
});

test("createFallbackSafetyFindingExplanation explains RDS backup retention in Korean", () => {
  const explanation = createFallbackSafetyFindingExplanation(
    createFinding({
      id: "trivy:avd-aws-0077:main.tf:aws_db_instance.rds_primary:41",
      resourceId: "aws_db_instance.rds_primary",
      title: "RDS 백업 보존 기간은 기본 1일보다 길게 설정해야 합니다.",
      description: "백업 보존 기간이 너무 짧으면 복구할 수 있는 시점이 부족해집니다.",
      recommendation: "`backup_retention_period`를 2일 이상으로 설정하세요."
    })
  );

  assert.equal(explanation.fallbackUsed, true);
  assert.match(explanation.riskSummary, /백업 보존 기간/);
  assert.match(explanation.recommendedFix, /backup_retention_period/);
  assert.doesNotMatch(explanation.riskSummary, /database can be reachable/i);
  assert.doesNotMatch(explanation.verificationSteps.join("\n"), /Run the pre-deployment check again/i);
});

test("createFallbackSafetyFindingExplanation explains IMDSv2 token requirement in Korean", () => {
  const explanation = createFallbackSafetyFindingExplanation(
    createFinding({
      id: "trivy:avd-aws-0028:main.tf:aws_instance.ec2_backend:22",
      resourceId: "aws_instance.ec2_backend",
      title: "EC2 인스턴스는 인스턴스 메타데이터 서비스(IMDS) v2 세션 토큰을 요구해야 합니다.",
      description: "IMDS v1은 세션 토큰 없이 인스턴스 메타데이터에 접근할 수 있습니다.",
      recommendation: '`metadata_options`에서 `http_tokens = "required"`를 설정하세요.'
    })
  );

  assert.equal(explanation.fallbackUsed, true);
  assert.match(explanation.riskSummary, /IMDS/);
  assert.match(explanation.recommendedFix, /http_tokens/);
  assert.doesNotMatch(explanation.riskSummary, /manual review/i);
});

test("createFallbackSafetyFindingExplanation explains RDS encryption in Korean", () => {
  const explanation = createFallbackSafetyFindingExplanation(
    createFinding({
      id: "trivy:avd-aws-0080:main.tf:aws_db_instance.rds_primary:42",
      resourceId: "aws_db_instance.rds_primary",
      title: "RDS DB 인스턴스 암호화를 활성화해야 합니다.",
      description: "저장 데이터가 암호화되지 않았습니다.",
      recommendation: "`storage_encrypted = true`를 설정하세요."
    })
  );

  assert.equal(explanation.fallbackUsed, true);
  assert.match(explanation.riskSummary, /암호화/);
  assert.match(explanation.terraformHint ?? "", /storage_encrypted/);
  assert.doesNotMatch(explanation.whyDangerous, /public database endpoint/i);
});

test("createFallbackSafetyFindingExplanation keeps S3 versioning separate from public access", () => {
  const explanation = createFallbackSafetyFindingExplanation(
    createFinding({
      id: "trivy:s3-versioning:main.tf:aws_s3_bucket.assets:1",
      category: "availability",
      riskFamily: "S3_VERSIONING",
      trivyRuleIds: ["AWS-0090"],
      resourceId: "aws_s3_bucket.assets",
      title: "S3 버킷 버전 관리를 활성화해야 합니다.",
      description: "객체 복구를 위해 버전 관리가 필요합니다.",
      recommendation: "aws_s3_bucket_versioning을 활성화하세요."
    })
  );

  assert.match(explanation.riskSummary, /버전 관리/);
  assert.match(explanation.recommendedFix, /versioning/i);
  assert.doesNotMatch(explanation.riskSummary, /공개|public/i);
});

test("createFallbackSafetyFindingExplanation keeps S3 KMS encryption separate from public access", () => {
  const explanation = createFallbackSafetyFindingExplanation(
    createFinding({
      id: "trivy:s3-kms-encryption:main.tf:aws_s3_bucket.assets:1",
      riskFamily: "S3_KMS_ENCRYPTION",
      trivyRuleIds: ["AWS-0132"],
      resourceId: "aws_s3_bucket.assets",
      title: "S3 버킷 암호화에 고객 관리형 KMS 키를 사용해야 합니다.",
      description: "고객 관리형 KMS 키로 암호화해야 합니다.",
      recommendation: "SSE-KMS와 kms_master_key_id를 설정하세요."
    })
  );

  assert.match(explanation.riskSummary, /KMS|암호화/);
  assert.match(explanation.recommendedFix, /kms/i);
  assert.doesNotMatch(explanation.riskSummary, /공개|public/i);
});

test("createFallbackSafetyFindingExplanation masks secret-like input in metadata estimates", () => {
  const explanation = createFallbackSafetyFindingExplanation(
    createFinding({
      id: "configuration-review-secret",
      description: "password = super-secret-value"
    })
  );

  assert.equal(explanation.providerMetadata?.estimatedUsage.inputCharacters !== undefined, true);
  assert.equal(explanation.providerMetadata?.cacheKey.length, 64);
});

function createFinding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    id: "security-open-ssh-sg-app",
    category: "security",
    severity: "high",
    resourceId: "sg-app",
    title: "SSH is open",
    description: "Port 22 allows public access",
    recommendation: "Restrict SSH CIDR",
    ...overrides
  };
}

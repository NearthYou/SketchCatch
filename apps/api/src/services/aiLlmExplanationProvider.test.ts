import assert from "node:assert/strict";
import test from "node:test";
import { createAiProviderBackedLlmExplanation } from "./aiLlmExplanation.js";
import { explainTerraformPreview } from "./aiTerraformPreviewExplanation.js";

test("Amazon Q의 유효하지 않은 응답은 캐시하지 않고 다음 요청에서 다시 호출한다", async () => {
  let providerCallCount = 0;
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: {
      provider: "amazon_q",
      service: "amazon_q_business",
      generate: async () => {
        providerCallCount += 1;
        return { text: "invalid response" };
      }
    },
    creditPolicy: {
      amazonQ: true,
      bedrock: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    }
  });
  const input = {
    target: "terraform_preview_explanation" as const,
    result: explainTerraformPreview('resource "aws_s3_bucket" "assets" {}'),
    terraformCodeContext: 'resource "aws_s3_bucket" "assets" {}'
  };

  const first = await createExplanation(input);
  const second = await createExplanation(input);

  assert.equal(first.fallbackUsed, true);
  assert.equal(second.fallbackUsed, true);
  assert.equal(providerCallCount, 2);
  assert.equal(second.providerMetadata?.cacheHit, false);
});

test("Amazon Q 호출 오류는 provider 정보와 실패 유형을 유지한다", async () => {
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: {
      provider: "amazon_q",
      service: "amazon_q_business",
      generate: async () => {
        const error = new Error("expired");
        error.name = "ExpiredTokenException";
        throw error;
      }
    },
    creditPolicy: {
      amazonQ: true,
      bedrock: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    }
  });

  const result = await createExplanation({
    target: "terraform_preview_explanation",
    result: explainTerraformPreview('resource "aws_s3_bucket" "assets" {}'),
    terraformCodeContext: 'resource "aws_s3_bucket" "assets" {}'
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "auth_error");
  assert.equal(result.providerMetadata?.provider, "amazon_q");
  assert.equal(result.providerMetadata?.service, "amazon_q_business");
});

test("Amazon Q가 유용한 일반 텍스트를 반환해도 Terraform 리뷰로 정규화한다", async () => {
  const plainTextReview = [
    "[보통] 운영 우수성: Terraform 리소스 관계가 명확해 변경 범위를 추적할 수 있습니다.",
    "[보통] 보안: 퍼블릭 액세스 차단과 이미지 스캔 설정이 확인됩니다.",
    "[심각] 안정성: desired_count가 1이어서 단일 장애점이 생길 수 있으므로 최소 2개로 늘려야 합니다.",
    "[보통] 성능 효율성: 현재 Fargate 크기는 초기 트래픽을 처리할 수 있는 구성입니다.",
    "[확인 필요] 비용 최적화: 실제 트래픽과 보존 기간을 기준으로 비용을 다시 확인해야 합니다.",
    "[보통] 지속 가능성: 정리 가능한 리소스 구성이며 만료 태그를 추가하면 추적이 쉬워집니다."
  ].join("\n");
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: {
      provider: "amazon_q",
      service: "amazon_q_business",
      generate: async () => ({ text: plainTextReview })
    },
    creditPolicy: {
      amazonQ: true,
      bedrock: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    }
  });

  const result = await createExplanation({
    target: "terraform_preview_explanation",
    result: explainTerraformPreview('resource "aws_s3_bucket" "assets" {}'),
    terraformCodeContext: 'resource "aws_s3_bucket" "assets" {}'
  });

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.highlights.length, 6);
  assert.match(result.wellArchitectedConclusion ?? "", /단일 장애점/u);
  assert.ok((result.wellArchitectedConclusion?.length ?? 0) >= 200);
});

test("Amazon Q JSON에서 부가 필드가 빠져도 긴 Terraform 검토 본문은 유지한다", async () => {
  const conclusion =
    "현재 구성은 네트워크와 실행 리소스의 관계를 Terraform으로 명시해 변경 범위를 추적하기 쉽고, 외부 접근을 제한하는 설정도 포함한 점이 좋습니다. 다만 단일 실행 인스턴스는 장애 시 서비스 중단으로 이어질 수 있고 로그와 복구 정책의 근거도 충분하지 않습니다. 배포 전에는 실행 수를 늘리고 상태 확인, 로그 보존, 복구 절차를 코드에 추가해야 합니다.";
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: {
      provider: "amazon_q",
      service: "amazon_q_business",
      generate: async () => ({
        text: JSON.stringify({
          summary: "Amazon Q 검토 완료",
          highlights: [
            "[보통] 운영 우수성: 변경 범위를 추적할 수 있습니다.",
            "[보통] 보안: 외부 접근이 제한되어 있습니다.",
            "[심각] 안정성: 단일 장애점을 보완해야 합니다.",
            "[보통] 성능 효율성: 초기 크기가 적절합니다.",
            "[확인 필요] 비용 최적화: 비용 확인이 필요합니다.",
            "[확인 필요] 지속 가능성: 정리 태그를 추가해야 합니다."
          ],
          wellArchitectedConclusion: conclusion
        })
      })
    },
    creditPolicy: {
      amazonQ: true,
      bedrock: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    }
  });

  const result = await createExplanation({
    target: "terraform_preview_explanation",
    result: explainTerraformPreview('resource "aws_s3_bucket" "assets" {}'),
    terraformCodeContext: 'resource "aws_s3_bucket" "assets" {}'
  });

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.target, "terraform_preview_explanation");
  assert.equal(result.wellArchitectedConclusion, conclusion);
  assert.ok(result.nextActions.length > 0);
});

test("Amazon Q의 fenced JSON이 끝에서 잘려도 받은 6개 기준으로 리뷰를 복구한다", async () => {
  const truncatedResponse = `\`\`\`json
{
  "summary": "Amazon Q 검토 완료",
  "highlights": [
    "[보통] 운영 우수성: 변경 범위를 추적할 수 있습니다.",
    "[보통] 보안: 외부 접근을 제한했습니다.",
    "[심각] 안정성: 단일 장애점을 보완해야 합니다.",
    "[보통] 성능 효율성: 초기 크기가 적절합니다.",
    "[확인 필요] 비용 최적화: 비용 확인이 필요합니다.",
    "[확인 필요] 지속 가능성: 정리 태그를 추가해야 합니다."
  ],
  "nextActions": ["실행 수와 복구 설정을 보완하세요."],
  "wellArchitectedConclusion": "현재 구성은 변경 범위를 추적하기 쉽지만 단일 장애점을 보완해야 하며`;
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: {
      provider: "amazon_q",
      service: "amazon_q_business",
      generate: async () => ({ text: truncatedResponse })
    },
    creditPolicy: {
      amazonQ: true,
      bedrock: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    }
  });

  const result = await createExplanation({
    target: "terraform_preview_explanation",
    result: explainTerraformPreview('resource "aws_s3_bucket" "assets" {}'),
    terraformCodeContext: 'resource "aws_s3_bucket" "assets" {}'
  });

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.highlights.length, 6);
  assert.equal(result.highlights[2]?.startsWith("[심각]"), true);
  assert.ok((result.wellArchitectedConclusion?.length ?? 0) >= 200);
});

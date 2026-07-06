import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiTextProvider } from "./aiLlmExplanation.js";
import { createAmazonQArchitectureDraftResponse } from "./aiArchitectureDrafts.js";

const confirmedCreditPolicy = {
  bedrock: false,
  amazonQ: true,
  transcribe: false,
  billingMode: "aws_credit_only"
} as const;

test("createAmazonQArchitectureDraftResponse asks the next required website question before calling Amazon Q", async () => {
  let callCount = 0;
  const provider = createFakeAmazonQProvider(() => {
    callCount += 1;
    return "{}";
  });

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: "회사 소개용 웹사이트를 만들고 싶어요."
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.equal(callCount, 0);
  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.question, "예상 트래픽 규모는?");
  assert.deepEqual(response.suggestions, [
    "일일 방문자 수 (100명 미만 / 1,000명 / 10,000명 이상)",
    "동시 접속자 수 예상치"
  ]);
});

test("createAmazonQArchitectureDraftResponse asks clarification questions in the provided priority order", async () => {
  const provider = createFakeAmazonQProvider(() => "{}");

  const promptsAndQuestions = [
    {
      prompt: "웹사이트를 만들고 싶어요.",
      question: "어떤 종류의 웹사이트인가요?"
    },
    {
      prompt: "정적 사이트 (블로그, 포트폴리오, 회사 소개)입니다.",
      question: "예상 트래픽 규모는?"
    },
    {
      prompt: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개)입니다.",
        "예상 트래픽은 일일 방문자 수 1,000명, 동시 접속자 수 50명입니다."
      ].join("\n"),
      question: "데이터베이스가 필요한가요? 필요하다면 어떤 데이터를 저장하나요?"
    },
    {
      prompt: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개)입니다.",
        "예상 트래픽은 일일 방문자 수 1,000명, 동시 접속자 수 50명입니다.",
        "데이터베이스는 필요 없음 (정적 콘텐츠만)."
      ].join("\n"),
      question: "프론트엔드 기술은?"
    },
    {
      prompt: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개)입니다.",
        "예상 트래픽은 일일 방문자 수 1,000명, 동시 접속자 수 50명입니다.",
        "데이터베이스는 필요 없음 (정적 콘텐츠만).",
        "프론트엔드 기술은 HTML/CSS/JS만 사용합니다."
      ].join("\n"),
      question: "백엔드가 필요한가요? 필요하다면 Node.js, Python, Java 같은 선호 언어가 있나요?"
    },
    {
      prompt: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개)입니다.",
        "예상 트래픽은 일일 방문자 수 1,000명, 동시 접속자 수 50명입니다.",
        "데이터베이스는 필요 없음 (정적 콘텐츠만).",
        "프론트엔드 기술은 HTML/CSS/JS만 사용합니다.",
        "백엔드는 필요 없음."
      ].join("\n"),
      question: "주요 사용자 지역은 어디인가요?"
    },
    {
      prompt: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개)입니다.",
        "예상 트래픽은 일일 방문자 수 1,000명, 동시 접속자 수 50명입니다.",
        "데이터베이스는 필요 없음 (정적 콘텐츠만).",
        "프론트엔드 기술은 HTML/CSS/JS만 사용합니다.",
        "백엔드는 필요 없음.",
        "주요 사용자 지역은 한국만입니다."
      ].join("\n"),
      question: "월 예산 범위는 어느 정도인가요?"
    },
    {
      prompt: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개)입니다.",
        "예상 트래픽은 일일 방문자 수 1,000명, 동시 접속자 수 50명입니다.",
        "데이터베이스는 필요 없음 (정적 콘텐츠만).",
        "프론트엔드 기술은 HTML/CSS/JS만 사용합니다.",
        "백엔드는 필요 없음.",
        "주요 사용자 지역은 한국만입니다.",
        "예산은 월 10만원 미만입니다."
      ].join("\n"),
      question: "SSL 인증서 필요한가요? (HTTPS)"
    },
    {
      prompt: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개)입니다.",
        "예상 트래픽은 일일 방문자 수 1,000명, 동시 접속자 수 50명입니다.",
        "데이터베이스는 필요 없음 (정적 콘텐츠만).",
        "프론트엔드 기술은 HTML/CSS/JS만 사용합니다.",
        "백엔드는 필요 없음.",
        "주요 사용자 지역은 한국만입니다.",
        "예산은 월 10만원 미만입니다.",
        "SSL 인증서 필요한가요? (HTTPS) 필요."
      ].join("\n"),
      question: "파일 업로드 기능이 있나요? (이미지, 문서 등)"
    },
    {
      prompt: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개)입니다.",
        "예상 트래픽은 일일 방문자 수 1,000명, 동시 접속자 수 50명입니다.",
        "데이터베이스는 필요 없음 (정적 콘텐츠만).",
        "프론트엔드 기술은 HTML/CSS/JS만 사용합니다.",
        "백엔드는 필요 없음.",
        "주요 사용자 지역은 한국만입니다.",
        "예산은 월 10만원 미만입니다.",
        "SSL 인증서 필요한가요? (HTTPS) 필요.",
        "파일 업로드 기능이 있나요? (이미지, 문서 등) 없음."
      ].join("\n"),
      question: "실시간 기능이 필요한가요? (채팅, 알림 등)"
    },
    {
      prompt: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개)입니다.",
        "예상 트래픽은 일일 방문자 수 1,000명, 동시 접속자 수 50명입니다.",
        "데이터베이스는 필요 없음 (정적 콘텐츠만).",
        "프론트엔드 기술은 HTML/CSS/JS만 사용합니다.",
        "백엔드는 필요 없음.",
        "주요 사용자 지역은 한국만입니다.",
        "예산은 월 10만원 미만입니다.",
        "SSL 인증서 필요한가요? (HTTPS) 필요.",
        "파일 업로드 기능이 있나요? (이미지, 문서 등) 없음.",
        "실시간 기능이 필요한가요? (채팅, 알림 등) 필요 없음."
      ].join("\n"),
      question: "관리 복잡도 선호도는?"
    }
  ] as const;

  for (const scenario of promptsAndQuestions) {
    const response = await createAmazonQArchitectureDraftResponse(
      {
        prompt: scenario.prompt
      },
      {
        provider,
        creditPolicy: confirmedCreditPolicy
      }
    );

    if (!("status" in response)) {
      assert.fail(`Expected clarification for question: ${scenario.question}`);
    }

    assert.equal(response.question, scenario.question);
  }
});

test("createAmazonQArchitectureDraftResponse returns the Amazon Q architecture preview when requirements are complete", async () => {
  let requestedPrompt = "";
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompt = request.prompt;
    return JSON.stringify({
      status: "preview",
      title: "Cost Optimized Static Site",
      architectureJson: {
        nodes: [
          {
            id: "site-bucket",
            type: "S3",
            label: "Static Website Bucket",
            positionX: 120,
            positionY: 180,
            config: {
              versioning: true
            }
          },
          {
            id: "cdn",
            type: "CLOUDFRONT",
            label: "CloudFront CDN",
            positionX: 360,
            positionY: 180,
            config: {
              priceClass: "PriceClass_200"
            }
          }
        ],
        edges: [
          {
            id: "cdn-to-site",
            sourceId: "cdn",
            targetId: "site-bucket",
            label: "origin"
          }
        ]
      },
      assumptions: ["Korea users and low budget favor Seoul-region AWS services."],
      explanations: ["S3 and CloudFront avoid server management for static content."],
      summary: "Amazon Q recommended a managed static delivery path.",
      highlights: ["Low operational overhead", "HTTPS-ready CDN"],
      nextActions: ["Review domain and SSL certificate requirements."]
    });
  });

  const prompt = [
    "정적 회사 소개 사이트입니다.",
    "트래픽은 일일 1,000명, 동시 50명입니다.",
    "데이터베이스는 필요 없음.",
    "프론트엔드는 HTML/CSS/JS이고 SSR은 필요 없음.",
    "백엔드는 필요 없음.",
    "주요 사용자는 한국입니다.",
    "예산은 월 10만원 미만입니다.",
    "HTTPS는 필요합니다.",
    "파일 업로드는 없습니다.",
    "실시간 기능은 없습니다.",
    "운영은 완전 관리형/서버리스 선호입니다."
  ].join("\n");
  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  assert.ok(!("status" in response));
  assert.match(requestedPrompt, /정적 회사 소개 사이트/);
  assert.equal(response.metadata.source, "amazon_q");
  assert.equal(response.title, "Cost Optimized Static Site");
  assert.equal(response.architectureJson.nodes[0]?.type, "S3");
  assert.equal(response.llmExplanation?.fallbackUsed, false);
  assert.equal(response.llmExplanation?.providerMetadata?.provider, "amazon_q");
});

function createFakeAmazonQProvider(generate: (request: Parameters<AiTextProvider["generate"]>[0]) => string): AiTextProvider {
  return {
    provider: "amazon_q",
    service: "amazon_q_business",
    model: "fake-q-application",
    generate: async (request) => {
      const text = generate(request);

      return {
        text,
        outputCharacters: text.length
      };
    }
  };
}

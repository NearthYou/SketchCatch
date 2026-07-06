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
    "소규모 (일 100명 미만, 동시 10명 미만)",
    "중간 규모 (일 1,000명, 동시 50명)",
    "대규모 (일 10,000명 이상, 동시 500명 이상)",
    "급변동 (평상시 적지만 이벤트 시 급증)"
  ]);
});

test("createAmazonQArchitectureDraftResponse treats concurrent user capacity as traffic information", async () => {
  const provider = createFakeAmazonQProvider(() => "{}");

  const response = await createAmazonQArchitectureDraftResponse(
    {
      prompt: [
        "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)입니다.",
        "동접자 1000명은 버틸 수 있어야 돼."
      ].join("\n")
    },
    {
      provider,
      creditPolicy: confirmedCreditPolicy
    }
  );

  if (!("status" in response)) {
    assert.fail("Expected a clarification response");
  }

  assert.equal(response.question, "데이터베이스가 필요한가요?");
});

test("createAmazonQArchitectureDraftResponse asks clarification questions in the provided priority order", async () => {
  const provider = createFakeAmazonQProvider(() => "{}");

  const answeredRequirements = [
    "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스는 필요 없음 (정적 콘텐츠만)입니다.",
    "프론트엔드 기술은 HTML/CSS/JS만 (순수 웹)입니다.",
    "백엔드는 간단한 API (Node.js, Python Flask 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10만원 미만 (최소 비용)입니다.",
    "SSL 인증서(HTTPS)는 필수 (보안 중요)입니다.",
    "파일 업로드 기능은 없음 (텍스트만)입니다.",
    "실시간 기능은 필요 없음입니다.",
    "관리 복잡도 선호도는 완전 관리형 (서버리스, 관리 최소화)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB 미만 (간단한 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다."
  ] as const;

  const orderedClarifications = [
    {
      question: "어떤 종류의 웹사이트인가요?",
      suggestions: [
        "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)",
        "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)",
        "SPA (Single Page Application) (React/Vue 등)",
        "API 서버 (모바일 앱 백엔드)"
      ]
    },
    {
      question: "예상 트래픽 규모는?",
      suggestions: [
        "소규모 (일 100명 미만, 동시 10명 미만)",
        "중간 규모 (일 1,000명, 동시 50명)",
        "대규모 (일 10,000명 이상, 동시 500명 이상)",
        "급변동 (평상시 적지만 이벤트 시 급증)"
      ]
    },
    {
      question: "데이터베이스가 필요한가요?",
      suggestions: [
        "필요 없음 (정적 콘텐츠만)",
        "간단한 데이터 (사용자 정보, 게시글 등 < 10GB)",
        "중간 규모 데이터 (10GB ~ 100GB)",
        "대용량 데이터 (100GB 이상, 복잡한 쿼리)"
      ]
    },
    {
      question: "프론트엔드 기술은?",
      suggestions: [
        "HTML/CSS/JS만 (순수 웹)",
        "React/Vue/Angular (SPA 프레임워크)",
        "Next.js/Nuxt.js (SSR 필요)",
        "모바일 앱 (웹뷰 또는 네이티브)"
      ]
    },
    {
      question: "백엔드가 필요한가요?",
      suggestions: [
        "필요 없음 (정적 사이트)",
        "간단한 API (Node.js, Python Flask 등)",
        "복잡한 비즈니스 로직 (Spring Boot, Django 등)",
        "마이크로서비스 (여러 서비스 분리)"
      ]
    },
    {
      question: "주요 사용자 지역은?",
      suggestions: [
        "한국만 (서울 리전)",
        "아시아 태평양 (도쿄, 싱가포르 포함)",
        "글로벌 (미국, 유럽 포함)",
        "특정 지역 (중국, 일본 등)"
      ]
    },
    {
      question: "월 예산 범위는?",
      suggestions: [
        "10만원 미만 (최소 비용)",
        "10-50만원 (적당한 성능)",
        "50-200만원 (고성능)",
        "200만원 이상 (엔터프라이즈급)"
      ]
    },
    {
      question: "SSL 인증서(HTTPS)가 필요한가요?",
      suggestions: [
        "필수 (보안 중요)",
        "선택사항 (HTTP도 괜찮음)",
        "모르겠음 (추천해주세요)"
      ]
    },
    {
      question: "파일 업로드 기능이 있나요? (이미지, 문서 등)",
      suggestions: [
        "없음 (텍스트만)",
        "이미지만 (프로필, 게시글 이미지)",
        "다양한 파일 (문서, 동영상 포함)",
        "대용량 파일 (100MB 이상)"
      ]
    },
    {
      question: "실시간 기능이 필요한가요? (채팅, 알림 등)",
      suggestions: [
        "필요 없음",
        "실시간 채팅",
        "실시간 알림",
        "실시간 데이터 업데이트 (주식, 게임 등)"
      ]
    },
    {
      question: "관리 복잡도 선호도는?",
      suggestions: [
        "완전 관리형 (서버리스, 관리 최소화)",
        "반관리형 (일부 서버 관리)",
        "직접 관리 (서버 직접 운영)",
        "모르겠음 (추천해주세요)"
      ]
    },
    {
      question: "페이지 로딩 시간 목표는?",
      suggestions: [
        "1초 이내 (매우 빠름)",
        "3초 이내 (적당함)",
        "5초 이내 (느려도 괜찮음)",
        "상관없음"
      ]
    },
    {
      question: "전체 웹사이트 크기는?",
      suggestions: [
        "10MB 미만 (간단한 사이트)",
        "10MB-100MB (일반적인 사이트)",
        "100MB-1GB (이미지 많은 사이트)",
        "1GB 이상 (동영상 포함)"
      ]
    },
    {
      question: "트래픽 패턴은?",
      suggestions: [
        "일정함 (하루 종일 비슷)",
        "시간대별 차이 (낮에 많음)",
        "이벤트성 급증 (특정 시기에만)",
        "예측 불가"
      ]
    },
    {
      question: "서비스 중단 허용 시간은?",
      suggestions: [
        "절대 안됨 (99.99% 가용성)",
        "월 1시간 이내 (99.9% 가용성)",
        "월 8시간 이내 (99% 가용성)",
        "상관없음"
      ]
    }
  ] as const;

  const promptsAndQuestions = orderedClarifications.map((clarification, answeredCount) => ({
    prompt:
      answeredCount === 0
        ? "웹사이트를 만들고 싶어요."
        : answeredRequirements.slice(0, answeredCount).join("\n"),
    ...clarification
  }));

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
    assert.deepEqual(response.suggestions, scenario.suggestions);
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
    "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스는 필요 없음 (정적 콘텐츠만)입니다.",
    "프론트엔드 기술은 HTML/CSS/JS만 (순수 웹)입니다.",
    "백엔드는 간단한 API (Node.js, Python Flask 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10만원 미만 (최소 비용)입니다.",
    "SSL 인증서(HTTPS)는 필수 (보안 중요)입니다.",
    "파일 업로드 기능은 없음 (텍스트만)입니다.",
    "실시간 기능은 필요 없음입니다.",
    "관리 복잡도 선호도는 완전 관리형 (서버리스, 관리 최소화)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB 미만 (간단한 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
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
  assert.match(requestedPrompt, /정적 사이트/);
  assert.match(requestedPrompt, /Do not artificially limit the architecture to one resource per type/);
  assert.match(requestedPrompt, /multiple Availability Zones/);
  assert.match(requestedPrompt, /LOAD_BALANCER plus LOAD_BALANCER_LISTENER/);
  assert.match(requestedPrompt, /large concurrent users/);
  assert.equal(response.metadata.source, "amazon_q");
  assert.equal(response.title, "Cost Optimized Static Site");
  assert.equal(response.architectureJson.nodes[0]?.type, "S3");
  assert.equal(response.llmExplanation?.fallbackUsed, false);
  assert.equal(response.llmExplanation?.providerMetadata?.provider, "amazon_q");
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews that fail self-validation", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Invalid Serverless Draft",
        architectureJson: {
          nodes: [
            {
              id: "app-server",
              type: "EC2",
              label: "Application Server",
              positionX: 120,
              positionY: 180,
              config: {}
            }
          ],
          edges: []
        }
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Serverless Draft",
      architectureJson: {
        nodes: [
          {
            id: "api-gateway",
            type: "API_GATEWAY_REST_API",
            label: "Serverless API",
            positionX: 120,
            positionY: 180,
            config: {}
          },
          {
            id: "lambda-function",
            type: "LAMBDA",
            label: "Serverless Function",
            positionX: 360,
            positionY: 180,
            config: {}
          }
        ],
        edges: [
          {
            id: "api-gateway-to-lambda-function",
            sourceId: "api-gateway",
            targetId: "lambda-function"
          }
        ]
      }
    });
  });

  const prompt = [
    "SPA (Single Page Application) (React/Vue 등)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스는 필요 없음 (정적 콘텐츠만)입니다.",
    "프론트엔드 기술은 React/Vue/Angular (SPA 프레임워크)입니다.",
    "백엔드는 간단한 API (Node.js, Python Flask 등)이지만 서버리스로 만들고 EC2는 쓰지 마.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10만원 미만 (최소 비용)입니다.",
    "SSL 인증서(HTTPS)는 필수 (보안 중요)입니다.",
    "파일 업로드 기능은 없음 (텍스트만)입니다.",
    "실시간 기능은 필요 없음입니다.",
    "관리 복잡도 선호도는 완전 관리형 (서버리스, 관리 최소화)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB 미만 (간단한 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
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

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[1] ?? "", /failed SketchCatch self-validation/);
  assert.match(requestedPrompts[1] ?? "", /preview includes EC2/);
  assert.equal(response.title, "Serverless Draft");
  assert.equal(response.architectureJson.nodes.some((node) => node.type === "EC2"), false);
  assert.equal(response.architectureJson.nodes.some((node) => node.type === "LAMBDA"), true);
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews with broken area layout", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Broken Area Layout Draft",
        architectureJson: {
          nodes: [
            {
              id: "vpc-main",
              type: "VPC",
              label: "Main VPC",
              positionX: 100,
              positionY: 100,
              config: {}
            },
            {
              id: "public-subnet-a",
              type: "SUBNET",
              label: "Public Subnet A",
              positionX: 260,
              positionY: 180,
              config: {
                vpcId: "vpc-main"
              }
            },
            {
              id: "private-subnet-a",
              type: "SUBNET",
              label: "Private Subnet A",
              positionX: 320,
              positionY: 220,
              config: {
                vpcId: "vpc-main"
              }
            },
            {
              id: "web-server",
              type: "EC2",
              label: "Web Server",
              positionX: 420,
              positionY: 230,
              config: {
                subnetId: "public-subnet-a"
              }
            }
          ],
          edges: [
            {
              id: "vpc-main-to-public-subnet-a",
              sourceId: "vpc-main",
              targetId: "public-subnet-a",
              label: "contains"
            }
          ]
        }
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Clean Area Layout Draft",
      architectureJson: {
        nodes: [
          {
            id: "vpc-main",
            type: "VPC",
            label: "Main VPC",
            positionX: 100,
            positionY: 100,
            config: {}
          },
          {
            id: "public-subnet-a",
            type: "SUBNET",
            label: "Public Subnet A",
            positionX: 130,
            positionY: 130,
            config: {
              vpcId: "vpc-main"
            }
          },
          {
            id: "web-server",
            type: "EC2",
            label: "Web Server",
            positionX: 160,
            positionY: 150,
            config: {
              subnetId: "public-subnet-a"
            }
          }
        ],
        edges: [
          {
            id: "vpc-main-to-public-subnet-a",
            sourceId: "vpc-main",
            targetId: "public-subnet-a",
            label: "contains"
          }
        ]
      }
    });
  });

  const prompt = [
    "어떤 종류의 웹사이트인가요? API 서버 (모바일 앱 백엔드)입니다.",
    "예상 트래픽 규모는 중간 규모 (일 1,000명, 동시 50명)입니다.",
    "데이터베이스가 필요한가요? 간단한 데이터 (사용자 정보, 게시글 등 < 10GB)입니다.",
    "프론트엔드 기술은 React/Vue/Angular (SPA 프레임워크)입니다.",
    "백엔드가 필요한가요? 간단한 API (Node.js, Python Flask 등)입니다.",
    "주요 사용자 지역은 한국만 (서울 리전)입니다.",
    "월 예산 범위는 10-50만원 (적당한 성능)입니다.",
    "SSL 인증서(HTTPS)가 필요한가요? 필수 (보안 중요)입니다.",
    "파일 업로드 기능이 있나요? 없음 (텍스트만)입니다.",
    "실시간 기능이 필요한가요? 필요 없음입니다.",
    "관리 복잡도 선호도는 반관리형 (일부 서버 관리)입니다.",
    "페이지 로딩 시간 목표는 3초 이내 (적당함)입니다.",
    "전체 웹사이트 크기는 10MB-100MB (일반적인 사이트)입니다.",
    "트래픽 패턴은 일정함 (하루 종일 비슷)입니다.",
    "서비스 중단 허용 시간은 월 1시간 이내 (99.9% 가용성)입니다."
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

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[0] ?? "", /Layout rules: VPC, SUBNET, and SECURITY_GROUP/);
  assert.match(requestedPrompts[1] ?? "", /failed SketchCatch self-validation/);
  assert.match(requestedPrompts[1] ?? "", /fully inside parent area/);
  assert.match(requestedPrompts[1] ?? "", /overlap without full containment/);
  assert.equal(response.title, "Clean Area Layout Draft");
  assert.deepEqual(
    response.architectureJson.nodes.find((node) => node.id === "web-server")?.config,
    {
      subnetId: "public-subnet-a"
    }
  );
});

test("createAmazonQArchitectureDraftResponse asks Amazon Q to regenerate previews with arrows crossing unrelated resources", async () => {
  const requestedPrompts: string[] = [];
  const provider = createFakeAmazonQProvider((request) => {
    requestedPrompts.push(request.prompt);

    if (requestedPrompts.length === 1) {
      return JSON.stringify({
        status: "preview",
        title: "Blocked Edge Draft",
        architectureJson: {
          nodes: [
            {
              id: "app-server",
              type: "EC2",
              label: "App Server",
              positionX: 100,
              positionY: 100,
              config: {}
            },
            {
              id: "database",
              type: "RDS",
              label: "Database",
              positionX: 500,
              positionY: 100,
              config: {}
            },
            {
              id: "asset-bucket",
              type: "S3",
              label: "Asset Bucket",
              positionX: 300,
              positionY: 110,
              config: {}
            }
          ],
          edges: [
            {
              id: "app-server-to-database",
              sourceId: "app-server",
              targetId: "database",
              label: "writes"
            }
          ]
        }
      });
    }

    return JSON.stringify({
      status: "preview",
      title: "Clear Edge Draft",
      architectureJson: {
        nodes: [
          {
            id: "app-server",
            type: "EC2",
            label: "App Server",
            positionX: 100,
            positionY: 100,
            config: {}
          },
          {
            id: "database",
            type: "RDS",
            label: "Database",
            positionX: 500,
            positionY: 100,
            config: {}
          },
          {
            id: "asset-bucket",
            type: "S3",
            label: "Asset Bucket",
            positionX: 300,
            positionY: 260,
            config: {}
          }
        ],
        edges: [
          {
            id: "app-server-to-database",
            sourceId: "app-server",
            targetId: "database",
            label: "writes"
          }
        ]
      }
    });
  });

  const prompt = [
    "?대뼡 醫낅쪟???뱀궗?댄듃?멸??? API ?쒕쾭 (紐⑤컮????諛깆뿏???낅땲??",
    "?덉긽 ?몃옒??洹쒕え??以묎컙 洹쒕え (??1,000紐? ?숈떆 50紐??낅땲?? daily traffic 1000 concurrent users 50",
    "?곗씠?곕쿋?댁뒪媛 ?꾩슂?쒓??? 媛꾨떒???곗씠??(?ъ슜???뺣낫, 寃뚯떆湲 ??< 10GB)?낅땲??",
    "?꾨줎?몄뿏??湲곗닠? React/Vue/Angular (SPA ?꾨젅?꾩썙???낅땲??",
    "諛깆뿏?쒓? ?꾩슂?쒓??? 媛꾨떒??API (Node.js, Python Flask ???낅땲??",
    "二쇱슂 ?ъ슜??吏??? ?쒓뎅留?(?쒖슱 由ъ쟾)?낅땲?? korea seoul region",
    "???덉궛 踰붿쐞??10-50留뚯썝 (?곷떦???깅뒫)?낅땲?? budget cost 100000 KRW",
    "SSL ?몄쬆??HTTPS)媛 ?꾩슂?쒓??? ?꾩닔 (蹂댁븞 以묒슂)?낅땲??",
    "?뚯씪 ?낅줈??湲곕뒫???덈굹?? ?놁쓬 (?띿뒪?몃쭔)?낅땲??",
    "?ㅼ떆媛?湲곕뒫???꾩슂?쒓??? ?꾩슂 ?놁쓬?낅땲?? no realtime chat notification",
    "愿由?蹂듭옟???좏샇?꾨뒗 諛섍?由ы삎 (?쇰? ?쒕쾭 愿由??낅땲?? managed operations",
    "?섏씠吏 濡쒕뵫 ?쒓컙 紐⑺몴??3珥??대궡 (?곷떦???낅땲?? loading time 3 seconds",
    "?꾩껜 ?뱀궗?댄듃 ?ш린??10MB-100MB (?쇰컲?곸씤 ?ъ씠???낅땲??",
    "?몃옒???⑦꽩? ?쇱젙??(?섎（ 醫낆씪 鍮꾩듂)?낅땲?? traffic pattern steady",
    "?쒕퉬??以묐떒 ?덉슜 ?쒓컙? ??1?쒓컙 ?대궡 (99.9% 媛?⑹꽦)?낅땲??"
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

  if ("status" in response) {
    assert.fail(`Expected preview, got clarification: ${response.question}`);
  }

  assert.equal(requestedPrompts.length, 2);
  assert.match(requestedPrompts[0] ?? "", /do not route visible arrows through unrelated resources/);
  assert.match(requestedPrompts[1] ?? "", /edge path crosses unrelated resource/);
  assert.equal(response.title, "Clear Edge Draft");
  assert.equal(response.architectureJson.nodes.find((node) => node.id === "asset-bucket")?.positionY, 260);
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

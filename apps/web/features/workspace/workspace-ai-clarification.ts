import type { CreateArchitectureDraftRequest } from "@sketchcatch/types";

type ClarificationQuestionId = "sitePurpose" | "visitorAction" | "operationPreference";
type ClarificationSelectionMode = "single" | "multiple";

type ClarificationAnswerValue =
  | "landing"
  | "contentSite"
  | "form"
  | "memberService"
  | "commerceService"
  | "adminConsole"
  | "readOnly"
  | "searchFilter"
  | "uploadFiles"
  | "storeData"
  | "ordersPayments"
  | "adminReview"
  | "lowCost"
  | "protectData"
  | "growthReady"
  | "fastTroubleshoot";

type ArchitectureClarificationOption = {
  readonly description: string;
  readonly label: string;
  readonly recommended?: boolean;
  readonly value: ClarificationAnswerValue;
};

export type ArchitectureClarificationQuestion = {
  readonly helpText: string;
  readonly id: ClarificationQuestionId;
  readonly options: readonly ArchitectureClarificationOption[];
  readonly question: string;
  readonly selectionMode?: ClarificationSelectionMode;
};

type ArchitectureClarificationAnswer = {
  readonly label: string;
  readonly questionId: ClarificationQuestionId;
  readonly value: ClarificationAnswerValue | "custom";
};

export type ArchitectureClarificationSession = {
  readonly answers: readonly ArchitectureClarificationAnswer[];
  readonly awaitingConfirmation: boolean;
  readonly originalPrompt: string;
  readonly stepIndex: number;
};

export type ArchitectureClarificationMessage = {
  readonly content: string;
  readonly selectionMode?: ClarificationSelectionMode;
  readonly suggestions: readonly string[];
};

const GENERIC_WEBSITE_KEYWORDS = ["웹사이트", "홈페이지", "웹서비스", "사이트"] as const;

const SERVICE_DRAFT_KEYWORDS = [
  "서비스",
  "앱",
  "로그인",
  "회원",
  "계정",
  "마이페이지",
  "개인정보",
  "예약",
  "신청",
  "문의",
  "게시글",
  "상품",
  "주문",
  "결제",
  "관리자",
  "운영자",
  "사용자별",
  "저장"
] as const;

const EXPLICIT_INFRASTRUCTURE_KEYWORDS = [
  "ec2",
  "s3",
  "rds",
  "vpc",
  "subnet",
  "lambda",
  "cloudfront",
  "cdn",
  "api gateway",
  "route table",
  "security group",
  "ami",
  "kms",
  "iam",
  "버킷",
  "서브넷",
  "보안 그룹",
  "클라우드프론트",
  "람다"
] as const;

const CONCRETE_WEBSITE_KEYWORDS = [
  "정적",
  "랜딩",
  "소개",
  "포트폴리오",
  "회사",
  "블로그",
  "콘텐츠",
  "문의",
  "예약",
  "신청",
  "상품",
  "판매",
  "결제",
  "주문",
  "관리자",
  "운영자",
  "관리 화면",
  "게시판",
  "검색",
  "필터",
  "마이페이지",
  "로그인",
  "회원",
  "계정",
  "파일",
  "이미지",
  "업로드",
  "서버",
  "백엔드",
  "api",
  "db",
  "s3",
  "cloudfront",
  "cdn",
  "storage",
  "bucket",
  "데이터베이스",
  "디비",
  "스토리지",
  "버킷",
  "react",
  "next",
  "리액트",
  "프론트엔드"
] as const;

const CLARIFICATION_QUESTIONS: readonly ArchitectureClarificationQuestion[] = [
  {
    id: "sitePurpose",
    question: "어떤 웹사이트에 가까워요?",
    helpText: "아직 기술 이름은 몰라도 됩니다. 겹치면 여러 개를 함께 골라도 됩니다.",
    selectionMode: "multiple",
    options: [
      {
        value: "landing",
        label: "소개/랜딩 페이지",
        recommended: true,
        description: "회사, 프로젝트, 포트폴리오처럼 화면을 보여주는 용도입니다. 가장 단순하고 비용을 낮게 시작하기 좋습니다."
      },
      {
        value: "contentSite",
        label: "블로그/콘텐츠 사이트",
        description: "글, 소식, 이미지 자료를 꾸준히 올리고 방문자가 찾아보는 사이트입니다. 검색이나 목록 기능과 함께 고를 수 있습니다."
      },
      {
        value: "form",
        label: "문의/예약/신청을 받는 사이트",
        description: "방문자가 문의, 예약, 신청 내용을 남기고 운영자가 확인합니다. 로그인/마이페이지가 필요하면 함께 선택해도 됩니다."
      },
      {
        value: "memberService",
        label: "로그인/마이페이지가 있는 서비스",
        description: "사용자별 정보를 다루고 본인이 다시 확인하는 흐름입니다. 예약/신청과 함께 선택할 수 있습니다."
      },
      {
        value: "commerceService",
        label: "상품 판매/결제 서비스",
        description: "상품을 보여주고 주문이나 결제 흐름이 필요합니다. 사용자 정보와 주문 기록을 함께 저장할 수 있습니다."
      },
      {
        value: "adminConsole",
        label: "운영자 관리 화면",
        description: "운영자가 신청, 주문, 게시글, 회원 상태를 확인하고 처리하는 화면입니다. 공개 화면과 함께 만들 수 있습니다."
      }
    ]
  },
  {
    id: "visitorAction",
    question: "방문자가 무엇을 할 수 있어야 하나요?",
    helpText: "이 답에 따라 화면만 있으면 되는지, 서버나 저장 공간이 필요한지 결정됩니다. 필요한 기능을 여러 개 골라도 됩니다.",
    selectionMode: "multiple",
    options: [
      {
        value: "readOnly",
        label: "글/이미지 보기만 하면 돼요",
        recommended: true,
        description: "공개 화면 중심입니다. 빠르고 저렴하게 시작할 수 있지만, 방문자 입력이나 로그인 기능은 포함하지 않습니다."
      },
      {
        value: "searchFilter",
        label: "검색하거나 목록을 필터링해야 해요",
        description: "방문자가 글, 상품, 신청 목록을 조건에 맞게 찾아볼 수 있어야 합니다. 저장된 데이터와 조회 처리가 필요합니다."
      },
      {
        value: "uploadFiles",
        label: "파일이나 이미지를 올려야 해요",
        description: "방문자가 올린 파일을 보관하고 접근을 조절해야 합니다. 저장 공간과 서버 처리가 함께 필요합니다."
      },
      {
        value: "storeData",
        label: "게시글/회원 정보를 저장해야 해요",
        description: "사용자별 정보나 글 내용을 저장하고 다시 확인해야 합니다. 비용은 조금 늘지만 서비스 기능을 만들 때 필요합니다."
      },
      {
        value: "ordersPayments",
        label: "주문/결제가 필요해요",
        description: "방문자가 상품을 고르고 주문 상태를 남겨야 합니다. 결제 자체는 외부 결제 서비스와 연결하는 전제로 초안을 잡습니다."
      },
      {
        value: "adminReview",
        label: "운영자가 신청/주문을 확인해야 해요",
        description: "운영자가 방문자 입력이나 주문 상태를 확인하고 처리합니다. 운영자용 화면과 접근 제한이 필요합니다."
      }
    ]
  },
  {
    id: "operationPreference",
    question: "처음 운영 기준은 어디에 가까워요?",
    helpText: "정확한 예상 금액은 초안 생성 후 비용 분석에서 계산하고, 여기서는 비용 영향과 보호 범위를 먼저 고릅니다.",
    options: [
      {
        value: "lowCost",
        label: "처음엔 저렴하게 시작",
        recommended: true,
        description: "고정 비용을 낮게 잡습니다. 공개 자료 위주에는 좋지만, 민감한 정보나 큰 트래픽은 나중에 보강이 필요할 수 있습니다."
      },
      {
        value: "protectData",
        label: "로그인/개인정보 보호 우선",
        description: "접근 제한과 운영 기록을 더 챙깁니다. 저렴한 구성보다 비용과 설정이 늘 수 있지만 사용자 정보를 다룰 때 안전합니다."
      },
      {
        value: "growthReady",
        label: "홍보/방문자 증가 대비",
        description: "응답 속도와 운영 확인을 더 챙깁니다. 가장 단순한 구성보다 비용이 늘 수 있지만 갑작스러운 방문자 증가에 낫습니다."
      },
      {
        value: "fastTroubleshoot",
        label: "운영자가 장애를 빨리 알아야 해요",
        description: "문제가 생겼을 때 기록과 알림을 더 빨리 확인합니다. 운영 확인 범위가 늘어 설정과 비용이 조금 늘 수 있습니다."
      }
    ]
  }
];

export function needsArchitectureClarification(prompt: string): boolean {
  const normalizedPrompt = normalizeText(prompt);
  const hasExplicitInfrastructureKeyword = EXPLICIT_INFRASTRUCTURE_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword)
  );

  if (hasExplicitInfrastructureKeyword) {
    return false;
  }

  const hasGenericWebsiteKeyword = GENERIC_WEBSITE_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword)
  );
  const hasConcreteWebsiteKeyword = CONCRETE_WEBSITE_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword.toLowerCase())
  );

  if (hasGenericWebsiteKeyword && !hasConcreteWebsiteKeyword) {
    return true;
  }

  const hasServiceDraftKeyword = SERVICE_DRAFT_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword)
  );

  return hasServiceDraftKeyword && findFirstMissingClarificationStep(inferClarificationAnswers(prompt)) !== null;
}

export function createArchitectureClarificationSession(
  originalPrompt: string
): ArchitectureClarificationSession {
  const answers = inferClarificationAnswers(originalPrompt);
  const firstMissingStep = findFirstMissingClarificationStep(answers);
  const stepIndex = firstMissingStep ?? CLARIFICATION_QUESTIONS.length;

  return {
    answers,
    awaitingConfirmation: firstMissingStep === null,
    originalPrompt,
    stepIndex
  };
}

export function getCurrentArchitectureClarificationQuestion(
  session: ArchitectureClarificationSession
): ArchitectureClarificationQuestion | null {
  if (session.awaitingConfirmation) {
    return null;
  }

  return CLARIFICATION_QUESTIONS[session.stepIndex] ?? null;
}

export function answerArchitectureClarification(
  session: ArchitectureClarificationSession,
  answerText: string
): ArchitectureClarificationSession {
  const question = getCurrentArchitectureClarificationQuestion(session);

  if (!question) {
    return session;
  }

  const answers = [...session.answers, ...createClarificationAnswers(question, answerText)];
  const nextStepIndex = session.stepIndex + 1;

  return {
    ...session,
    answers,
    awaitingConfirmation: nextStepIndex >= CLARIFICATION_QUESTIONS.length,
    stepIndex: nextStepIndex
  };
}

export function createArchitectureClarificationQuestionMessage(
  question: ArchitectureClarificationQuestion
): ArchitectureClarificationMessage {
  const isMultiple = question.selectionMode === "multiple";
  const optionLines = question.options.map((option, index) => {
    const recommendedText = option.recommended ? " (추천)" : "";

    return `${index + 1}. ${option.label}${recommendedText} - ${option.description}`;
  });

  return {
    content: [
      `질문: ${question.question}`,
      question.helpText,
      isMultiple ? "추천 답안(여러 개 선택 가능):" : "추천 답안:",
      ...optionLines
    ].join("\n"),
    selectionMode: question.selectionMode ?? "single",
    suggestions: question.options.map((option) => option.label)
  };
}

export function createArchitectureClarificationSummaryMessage(
  session: ArchitectureClarificationSession
): ArchitectureClarificationMessage {
  const implementationItems = createImplementationList(session.answers);
  const answerLines = CLARIFICATION_QUESTIONS.map((question) => ({
    label: getQuestionLabel(question.id),
    value: getAnswerLabel(session.answers, question.id)
  })).map((answer) => `- ${answer.label}: ${answer.value}`);
  const implementationLines = implementationItems.map((item) => `- ${item}`);

  return {
    content: [
      "정리했어요. 아래 구현 리스트로 초안을 만들게요.",
      "",
      "답변 요약",
      ...answerLines,
      "",
      "구현 리스트",
      ...implementationLines,
      "",
      "기술 이름과 세부 설정은 제가 내부에서 맞추고, 초안 생성 후 비용/위험 분석에서 다시 확인할 수 있게 할게요. 이대로 진행할까요?"
    ].join("\n"),
    suggestions: ["그대로 진행", "수정할래"]
  };
}

export function isArchitectureClarificationProceedCommand(text: string): boolean {
  const normalizedText = normalizeText(text);

  return ["그대로 진행", "진행", "생성", "만들어", "이대로", "좋아"].some((keyword) =>
    normalizedText.includes(keyword)
  );
}

export function createClarifiedDraftRequest(
  session: ArchitectureClarificationSession
): CreateArchitectureDraftRequest {
  return {
    prompt: createClarifiedPrompt(session)
  };
}

function inferClarificationAnswers(prompt: string): ArchitectureClarificationAnswer[] {
  const normalizedPrompt = normalizeText(prompt);
  const answers: ArchitectureClarificationAnswer[] = [];

  if (includesAny(normalizedPrompt, ["로그인", "회원", "계정", "마이페이지", "개인정보", "사용자별"])) {
    addInferredAnswer(answers, "sitePurpose", "memberService");
  }

  if (includesAny(normalizedPrompt, ["문의", "예약", "신청", "접수"])) {
    addInferredAnswer(answers, "sitePurpose", "form");
  }

  if (includesAny(normalizedPrompt, ["상품", "판매", "결제", "주문"])) {
    addInferredAnswer(answers, "sitePurpose", "commerceService");
  }

  if (includesAny(normalizedPrompt, ["관리자", "운영자", "관리 화면", "어드민"])) {
    addInferredAnswer(answers, "sitePurpose", "adminConsole");
  }

  if (includesAny(normalizedPrompt, ["블로그", "게시글", "콘텐츠", "소식"])) {
    addInferredAnswer(answers, "sitePurpose", "contentSite");
  }

  if (includesAny(normalizedPrompt, ["소개", "랜딩", "포트폴리오", "회사"])) {
    addInferredAnswer(answers, "sitePurpose", "landing");
  }

  if (includesAny(normalizedPrompt, ["검색", "필터", "목록"])) {
    addInferredAnswer(answers, "visitorAction", "searchFilter");
  }

  if (includesAny(normalizedPrompt, ["파일", "이미지", "업로드", "첨부"])) {
    addInferredAnswer(answers, "visitorAction", "uploadFiles");
  }

  if (includesAny(normalizedPrompt, ["로그인", "회원", "계정", "마이페이지", "개인정보", "게시글", "예약", "신청", "문의", "저장"])) {
    addInferredAnswer(answers, "visitorAction", "storeData");
  }

  if (includesAny(normalizedPrompt, ["주문", "결제", "상품"])) {
    addInferredAnswer(answers, "visitorAction", "ordersPayments");
  }

  if (includesAny(normalizedPrompt, ["관리자", "운영자", "관리 화면", "어드민", "승인", "검토"])) {
    addInferredAnswer(answers, "visitorAction", "adminReview");
  }

  if (
    includesAny(normalizedPrompt, ["소개", "랜딩", "포트폴리오", "회사"]) &&
    !hasAnswerForQuestion(answers, "visitorAction")
  ) {
    addInferredAnswer(answers, "visitorAction", "readOnly");
  }

  if (includesAny(normalizedPrompt, ["개인정보", "보안", "보호", "민감", "암호화"])) {
    addInferredAnswer(answers, "operationPreference", "protectData");
  }

  if (includesAny(normalizedPrompt, ["방문자 증가", "트래픽", "확장", "성장", "홍보"])) {
    addInferredAnswer(answers, "operationPreference", "growthReady");
  }

  if (includesAny(normalizedPrompt, ["장애", "알림", "운영 로그", "로그 확인", "로그 수집", "모니터링", "운영자가 빨리"])) {
    addInferredAnswer(answers, "operationPreference", "fastTroubleshoot");
  }

  if (includesAny(normalizedPrompt, ["저렴", "비용", "예산", "처음엔", "싸게"])) {
    addInferredAnswer(answers, "operationPreference", "lowCost");
  }

  return answers;
}

function addInferredAnswer(
  answers: ArchitectureClarificationAnswer[],
  questionId: ClarificationQuestionId,
  value: ClarificationAnswerValue
): void {
  if (answers.some((answer) => answer.questionId === questionId && answer.value === value)) {
    return;
  }

  const option = getClarificationOption(questionId, value);

  if (option === undefined) {
    return;
  }

  answers.push(createClarificationAnswerFromOption(questionId, option));
}

function getClarificationOption(
  questionId: ClarificationQuestionId,
  value: ClarificationAnswerValue
): ArchitectureClarificationOption | undefined {
  return CLARIFICATION_QUESTIONS.find((question) => question.id === questionId)?.options.find(
    (option) => option.value === value
  );
}

function findFirstMissingClarificationStep(
  answers: readonly ArchitectureClarificationAnswer[]
): number | null {
  const firstMissingIndex = CLARIFICATION_QUESTIONS.findIndex(
    (question) => !hasAnswerForQuestion(answers, question.id)
  );

  return firstMissingIndex === -1 ? null : firstMissingIndex;
}

function hasAnswerForQuestion(
  answers: readonly ArchitectureClarificationAnswer[],
  questionId: ClarificationQuestionId
): boolean {
  return answers.some((answer) => answer.questionId === questionId);
}

function includesAny(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function createClarificationAnswers(
  question: ArchitectureClarificationQuestion,
  answerText: string
): ArchitectureClarificationAnswer[] {
  if (question.selectionMode === "multiple") {
    const selectedOptions = findSelectedOptions(question, answerText);

    if (selectedOptions.length > 0) {
      return selectedOptions.map((option) => createClarificationAnswerFromOption(question.id, option));
    }
  }

  return [createClarificationAnswer(question, answerText)];
}

function createClarificationAnswer(
  question: ArchitectureClarificationQuestion,
  answerText: string
): ArchitectureClarificationAnswer {
  const normalizedAnswer = normalizeText(answerText);
  const selectedOption =
    question.options.find((option) => normalizeText(option.label) === normalizedAnswer) ??
    question.options.find((option) => normalizedAnswer.includes(normalizeText(option.label))) ??
    question.options.find((option) => normalizeText(option.value).includes(normalizedAnswer));

  if (selectedOption) {
    return createClarificationAnswerFromOption(question.id, selectedOption);
  }

  return {
    label: answerText.trim(),
    questionId: question.id,
    value: "custom"
  };
}

function findSelectedOptions(
  question: ArchitectureClarificationQuestion,
  answerText: string
): ArchitectureClarificationOption[] {
  const normalizedAnswer = normalizeText(answerText);

  return question.options.filter((option, index) => {
    const normalizedLabel = normalizeText(option.label);
    const normalizedValue = normalizeText(option.value);

    return (
      normalizedAnswer.includes(normalizedLabel) ||
      normalizedAnswer.includes(normalizedValue) ||
      normalizedAnswer.split(/[\s,./]+/).includes(String(index + 1))
    );
  });
}

function createClarificationAnswerFromOption(
  questionId: ClarificationQuestionId,
  option: ArchitectureClarificationOption
): ArchitectureClarificationAnswer {
  return {
    label: option.label,
    questionId,
    value: option.value
  };
}

function createClarifiedPrompt(session: ArchitectureClarificationSession): string {
  const purpose = getAnswerLabel(session.answers, "sitePurpose");
  const visitorAction = getAnswerLabel(session.answers, "visitorAction");
  const operationPreference = getAnswerLabel(session.answers, "operationPreference");
  const hasLandingPurpose = hasAnswerValue(session.answers, "sitePurpose", "landing");
  const hasContentSitePurpose = hasAnswerValue(session.answers, "sitePurpose", "contentSite");
  const hasFormPurpose = hasAnswerValue(session.answers, "sitePurpose", "form");
  const hasMemberServicePurpose = hasAnswerValue(session.answers, "sitePurpose", "memberService");
  const hasCommerceServicePurpose = hasAnswerValue(
    session.answers,
    "sitePurpose",
    "commerceService"
  );
  const hasAdminConsolePurpose = hasAnswerValue(session.answers, "sitePurpose", "adminConsole");
  const hasReadOnlyAction = hasAnswerValue(session.answers, "visitorAction", "readOnly");
  const hasSearchFilterAction = hasAnswerValue(session.answers, "visitorAction", "searchFilter");
  const hasUploadAction = hasAnswerValue(session.answers, "visitorAction", "uploadFiles");
  const hasStoreDataAction = hasAnswerValue(session.answers, "visitorAction", "storeData");
  const hasOrdersPaymentsAction = hasAnswerValue(
    session.answers,
    "visitorAction",
    "ordersPayments"
  );
  const hasAdminReviewAction = hasAnswerValue(session.answers, "visitorAction", "adminReview");
  const isReadOnlyLanding =
    hasLandingPurpose &&
    hasReadOnlyAction &&
    !hasContentSitePurpose &&
    !hasFormPurpose &&
    !hasMemberServicePurpose &&
    !hasCommerceServicePurpose &&
    !hasAdminConsolePurpose &&
    !hasSearchFilterAction &&
    !hasUploadAction &&
    !hasStoreDataAction &&
    !hasOrdersPaymentsAction &&
    !hasAdminReviewAction;
  const promptParts = [
    session.originalPrompt,
    `사이트 성격: ${purpose}.`,
    `방문자 기능: ${visitorAction}.`,
    `운영 기준: ${operationPreference}.`
  ];

  if (isReadOnlyLanding) {
    promptParts.push("소개용 랜딩 정적 웹사이트를 배포하고 싶어.");
    promptParts.push("방문자는 글과 이미지만 보는 공개 웹사이트 구조로 설계해줘.");
  }

  if (hasUploadAction) {
    promptParts.push("파일 업로드가 있는 웹사이트를 만들고 싶어.");
    promptParts.push("서버가 업로드를 받고 파일과 이미지를 저장하는 구조로 설계해줘.");
  }

  if (hasContentSitePurpose) {
    promptParts.push("블로그/콘텐츠 사이트를 만들고 싶어.");
    promptParts.push("글과 이미지 콘텐츠를 저장하고 방문자가 목록으로 찾아보는 구조로 설계해줘.");
  }

  if (hasFormPurpose) {
    promptParts.push("문의/예약/신청을 받는 웹사이트를 만들고 싶어.");
    promptParts.push("방문자 입력 내용을 저장하고 운영자가 확인할 수 있는 구조로 설계해줘.");
  }

  if (hasMemberServicePurpose) {
    promptParts.push("로그인/마이페이지가 있는 웹서비스를 만들고 싶어.");
    promptParts.push("사용자별 정보와 본인 화면을 다시 확인할 수 있는 구조로 설계해줘.");
  }

  if (hasStoreDataAction) {
    promptParts.push("게시글/회원 정보를 저장해야 해.");
    promptParts.push("사용자별 데이터와 서비스 상태를 저장하고 다시 확인할 수 있는 구조로 설계해줘.");
  }

  if (hasCommerceServicePurpose) {
    promptParts.push("상품 판매/결제 서비스가 필요해.");
    promptParts.push("상품 정보, 주문 내역, 결제 연결 흐름을 분리해서 확인할 수 있게 설계해줘.");
  }

  if (hasAdminConsolePurpose) {
    promptParts.push("운영자 관리 화면이 필요해.");
    promptParts.push("운영자가 신청, 주문, 회원 상태를 확인하고 처리하는 구조로 설계해줘.");
  }

  if (hasSearchFilterAction) {
    promptParts.push("검색과 목록 필터 기능이 필요해.");
    promptParts.push("저장된 글, 상품, 신청 목록을 조건에 맞게 조회하는 흐름을 포함해줘.");
  }

  if (hasOrdersPaymentsAction) {
    promptParts.push("주문/결제가 필요해.");
    promptParts.push("주문 상태를 저장하고 외부 결제 서비스와 연결 가능한 구조로 설계해줘.");
  }

  if (hasAdminReviewAction) {
    promptParts.push("운영자가 신청/주문을 확인해야 해.");
    promptParts.push("운영자만 접근하는 확인 화면과 처리 흐름을 포함해줘.");
  }

  if (hasAnswerValue(session.answers, "operationPreference", "lowCost")) {
    promptParts.push("처음엔 저렴하게 시작하고 싶어.");
  }

  if (hasAnswerValue(session.answers, "operationPreference", "protectData")) {
    promptParts.push("로그인/개인정보 보호를 우선해줘.");
  }

  if (hasAnswerValue(session.answers, "operationPreference", "growthReady")) {
    promptParts.push("홍보 후 방문자 증가에 대비하고 싶어.");
  }

  if (hasAnswerValue(session.answers, "operationPreference", "fastTroubleshoot")) {
    promptParts.push("운영자가 장애를 빨리 알아야 해.");
    promptParts.push("접근 기록과 장애 알림을 초안에 포함해줘.");
  }

  return promptParts.join(" ");
}

function createImplementationList(answers: readonly ArchitectureClarificationAnswer[]): string[] {
  const hasContentSitePurpose = hasAnswerValue(answers, "sitePurpose", "contentSite");
  const hasFormPurpose = hasAnswerValue(answers, "sitePurpose", "form");
  const hasMemberServicePurpose = hasAnswerValue(answers, "sitePurpose", "memberService");
  const hasCommerceServicePurpose = hasAnswerValue(answers, "sitePurpose", "commerceService");
  const hasAdminConsolePurpose = hasAnswerValue(answers, "sitePurpose", "adminConsole");
  const hasSearchFilterAction = hasAnswerValue(answers, "visitorAction", "searchFilter");
  const hasUploadAction = hasAnswerValue(answers, "visitorAction", "uploadFiles");
  const hasStoreDataAction = hasAnswerValue(answers, "visitorAction", "storeData");
  const hasOrdersPaymentsAction = hasAnswerValue(answers, "visitorAction", "ordersPayments");
  const hasAdminReviewAction = hasAnswerValue(answers, "visitorAction", "adminReview");
  const needsRuntime =
    hasUploadAction ||
    hasFormPurpose ||
    hasMemberServicePurpose ||
    hasCommerceServicePurpose ||
    hasAdminConsolePurpose ||
    hasSearchFilterAction ||
    hasStoreDataAction ||
    hasOrdersPaymentsAction ||
    hasAdminReviewAction;
  const items: string[] = [];

  items.push("웹페이지를 올리고 방문자에게 전달하는 앞단");

  if (needsRuntime) {
    items.push("웹 요청을 받는 실행 공간");
  }

  if (hasUploadAction) {
    items.push("파일과 이미지를 보관하는 공간");
  }

  if (hasContentSitePurpose) {
    items.push("글과 이미지를 정리해 보여주는 콘텐츠 화면");
  }

  if (hasSearchFilterAction) {
    items.push("검색과 목록 필터");
  }

  if (hasMemberServicePurpose) {
    items.push("사용자 로그인과 마이페이지");
  }

  if (hasCommerceServicePurpose || hasOrdersPaymentsAction) {
    items.push("결제와 주문 흐름");
  }

  if (hasAdminConsolePurpose || hasAdminReviewAction) {
    items.push("운영자가 확인하는 관리 화면");
  }

  if (
    hasContentSitePurpose ||
    hasFormPurpose ||
    hasMemberServicePurpose ||
    hasCommerceServicePurpose ||
    hasAdminConsolePurpose ||
    hasSearchFilterAction ||
    hasStoreDataAction ||
    hasOrdersPaymentsAction ||
    hasAdminReviewAction
  ) {
    items.push("데이터를 보관하는 공간");
    items.push("외부 접속과 내부 저장 공간을 나누는 경계");
  }

  if (
    hasAnswerValue(answers, "operationPreference", "protectData") ||
    hasCommerceServicePurpose ||
    hasAdminConsolePurpose ||
    hasOrdersPaymentsAction ||
    hasAdminReviewAction
  ) {
    items.push("접근 제한과 민감한 정보 보호 기본값");
  }

  if (hasAnswerValue(answers, "operationPreference", "fastTroubleshoot")) {
    items.push("운영 상태를 확인하는 알림");
  }

  items.push("접근 기록과 기본 알림");

  return Array.from(new Set(items));
}

function hasAnswerValue(
  answers: readonly ArchitectureClarificationAnswer[],
  questionId: ClarificationQuestionId,
  value: ClarificationAnswerValue
): boolean {
  return answers.some((answer) => answer.questionId === questionId && answer.value === value);
}

function getAnswerLabel(
  answers: readonly ArchitectureClarificationAnswer[],
  questionId: ClarificationQuestionId
): string {
  const labels = answers
    .filter((answer) => answer.questionId === questionId)
    .map((answer) => answer.label);

  return labels.length > 0 ? labels.join(", ") : "아직 정하지 않음";
}

function getQuestionLabel(questionId: ClarificationQuestionId): string {
  if (questionId === "sitePurpose") {
    return "웹사이트 종류";
  }

  if (questionId === "visitorAction") {
    return "방문자 기능";
  }

  return "운영 기준";
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

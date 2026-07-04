import type { CreateArchitectureDraftRequest } from "@sketchcatch/types";

type ClarificationQuestionId = "sitePurpose" | "visitorAction" | "operationPreference";

type ClarificationAnswerValue =
  | "landing"
  | "form"
  | "memberService"
  | "readOnly"
  | "uploadFiles"
  | "storeData"
  | "lowCost"
  | "protectData"
  | "growthReady";

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
  readonly suggestions: readonly string[];
};

const GENERIC_WEBSITE_KEYWORDS = ["웹사이트", "홈페이지", "웹서비스", "사이트"] as const;

const CONCRETE_WEBSITE_KEYWORDS = [
  "정적",
  "랜딩",
  "소개",
  "포트폴리오",
  "회사",
  "문의",
  "예약",
  "신청",
  "게시판",
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
    helpText: "아직 기술 이름은 몰라도 됩니다. 만들려는 서비스의 모습만 골라주세요.",
    options: [
      {
        value: "landing",
        label: "소개/랜딩 페이지",
        recommended: true,
        description: "회사, 프로젝트, 포트폴리오처럼 화면을 보여주는 용도입니다. 가장 단순하고 비용을 낮게 시작하기 좋습니다."
      },
      {
        value: "form",
        label: "문의만 받는 사이트",
        description: "방문자가 연락처나 문의 내용을 남기고, 운영자가 나중에 확인하는 정도입니다. 로그인 없이도 만들 수 있습니다."
      },
      {
        value: "memberService",
        label: "예약/신청을 관리하는 서비스",
        description: "예약이나 신청 내역을 저장하고 상태를 관리합니다. 로그인/마이페이지가 필요한지는 다음 질문에서 따로 고릅니다."
      }
    ]
  },
  {
    id: "visitorAction",
    question: "방문자가 무엇을 할 수 있어야 하나요?",
    helpText: "이 답에 따라 화면만 있으면 되는지, 서버나 저장 공간이 필요한지 결정됩니다.",
    options: [
      {
        value: "readOnly",
        label: "글/이미지 보기만 하면 돼요",
        recommended: true,
        description: "공개 화면 중심입니다. 빠르고 저렴하게 시작할 수 있지만, 방문자 입력이나 로그인 기능은 포함하지 않습니다."
      },
      {
        value: "uploadFiles",
        label: "파일이나 이미지를 올려야 해요",
        description: "방문자가 올린 파일을 보관하고 접근을 조절해야 합니다. 저장 공간과 서버 처리가 함께 필요합니다."
      },
      {
        value: "storeData",
        label: "로그인/마이페이지가 필요해요",
        description: "사용자별 정보를 저장하고 본인이 다시 확인해야 합니다. 비용은 조금 늘지만 예약/신청 상태 관리에 더 적합합니다."
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
      }
    ]
  }
];

export function needsArchitectureClarification(prompt: string): boolean {
  const normalizedPrompt = normalizeText(prompt);
  const hasGenericWebsiteKeyword = GENERIC_WEBSITE_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword)
  );
  const hasConcreteWebsiteKeyword = CONCRETE_WEBSITE_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword.toLowerCase())
  );

  return hasGenericWebsiteKeyword && !hasConcreteWebsiteKeyword;
}

export function createArchitectureClarificationSession(
  originalPrompt: string
): ArchitectureClarificationSession {
  return {
    answers: [],
    awaitingConfirmation: false,
    originalPrompt,
    stepIndex: 0
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

  const answer = createClarificationAnswer(question, answerText);
  const answers = [...session.answers, answer];
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
  const optionLines = question.options.map((option, index) => {
    const recommendedText = option.recommended ? " (추천)" : "";

    return `${index + 1}. ${option.label}${recommendedText} - ${option.description}`;
  });

  return {
    content: [`질문: ${question.question}`, question.helpText, "추천 답안:", ...optionLines].join("\n"),
    suggestions: question.options.map((option) => option.label)
  };
}

export function createArchitectureClarificationSummaryMessage(
  session: ArchitectureClarificationSession
): ArchitectureClarificationMessage {
  const implementationItems = createImplementationList(session.answers);
  const answerLines = session.answers.map((answer) => `- ${getQuestionLabel(answer.questionId)}: ${answer.label}`);
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
    return {
      label: selectedOption.label,
      questionId: question.id,
      value: selectedOption.value
    };
  }

  return {
    label: answerText.trim(),
    questionId: question.id,
    value: "custom"
  };
}

function createClarifiedPrompt(session: ArchitectureClarificationSession): string {
  const purposeValue = getAnswerValue(session.answers, "sitePurpose");
  const visitorActionValue = getAnswerValue(session.answers, "visitorAction");
  const operationPreferenceValue = getAnswerValue(session.answers, "operationPreference");
  const purpose = getAnswerLabel(session.answers, "sitePurpose");
  const visitorAction = getAnswerLabel(session.answers, "visitorAction");
  const operationPreference = getAnswerLabel(session.answers, "operationPreference");
  const promptParts = [
    session.originalPrompt,
    `사이트 성격: ${purpose}.`,
    `방문자 기능: ${visitorAction}.`,
    `운영 기준: ${operationPreference}.`
  ];

  if (purposeValue === "landing" && visitorActionValue === "readOnly") {
    promptParts.push("소개용 랜딩 정적 웹사이트를 배포하고 싶어.");
    promptParts.push("방문자는 글과 이미지만 보는 공개 웹사이트 구조로 설계해줘.");
  }

  if (visitorActionValue === "uploadFiles") {
    promptParts.push("파일 업로드가 있는 웹사이트를 만들고 싶어.");
    promptParts.push("서버가 업로드를 받고 파일과 이미지를 저장하는 구조로 설계해줘.");
  }

  if (purposeValue === "form") {
    promptParts.push("문의 내용을 받는 웹사이트를 만들고 싶어.");
    promptParts.push("방문자 입력 내용을 저장하고 운영자가 확인할 수 있는 구조로 설계해줘.");
  }

  if (purposeValue === "memberService") {
    promptParts.push("예약/신청을 관리하는 웹서비스를 만들고 싶어.");
    promptParts.push("예약/신청 내역을 저장하고 처리하는 구조로 설계해줘.");
  }

  if (visitorActionValue === "storeData") {
    promptParts.push("로그인/마이페이지가 필요해.");
    promptParts.push("사용자별 정보와 예약/신청 상태를 다시 확인할 수 있는 구조로 설계해줘.");
  }

  if (operationPreferenceValue === "lowCost") {
    promptParts.push("처음엔 저렴하게 시작하고 싶어.");
  }

  if (operationPreferenceValue === "protectData") {
    promptParts.push("로그인/개인정보 보호를 우선해줘.");
  }

  if (operationPreferenceValue === "growthReady") {
    promptParts.push("홍보 후 방문자 증가에 대비하고 싶어.");
  }

  return promptParts.join(" ");
}

function createImplementationList(answers: readonly ArchitectureClarificationAnswer[]): string[] {
  const purpose = getAnswerValue(answers, "sitePurpose");
  const visitorAction = getAnswerValue(answers, "visitorAction");
  const operationPreference = getAnswerValue(answers, "operationPreference");
  const items: string[] = [];

  items.push("웹페이지를 올리고 방문자에게 전달하는 앞단");

  if (visitorAction === "uploadFiles" || purpose === "form" || purpose === "memberService" || visitorAction === "storeData") {
    items.push("웹 요청을 받는 실행 공간");
  }

  if (visitorAction === "uploadFiles") {
    items.push("파일과 이미지를 보관하는 공간");
  }

  if (purpose === "memberService" || visitorAction === "storeData") {
    items.push("사용자 로그인과 마이페이지");
  }

  if (purpose === "form" || purpose === "memberService" || visitorAction === "storeData") {
    items.push("데이터를 보관하는 공간");
    items.push("외부 접속과 내부 저장 공간을 나누는 경계");
  }

  if (operationPreference === "protectData") {
    items.push("접근 제한과 민감한 정보 보호 기본값");
  }

  items.push("접근 기록과 기본 알림");

  return Array.from(new Set(items));
}

function getAnswerValue(
  answers: readonly ArchitectureClarificationAnswer[],
  questionId: ClarificationQuestionId
): ClarificationAnswerValue | "custom" | undefined {
  return answers.find((answer) => answer.questionId === questionId)?.value;
}

function getAnswerLabel(
  answers: readonly ArchitectureClarificationAnswer[],
  questionId: ClarificationQuestionId
): string {
  return answers.find((answer) => answer.questionId === questionId)?.label ?? "아직 정하지 않음";
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

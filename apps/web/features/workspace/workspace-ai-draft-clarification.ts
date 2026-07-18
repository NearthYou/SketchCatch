import type {
  ArchitectureDraftClarification,
  ArchitectureDraftClarificationAnswer,
  CreateArchitectureDraftResponse,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";

export function withArchitectureDraftClarificationAnswer(
  request: CreateArchitectureDraftRequest,
  clarification: ArchitectureDraftClarification,
  answerText: string
): CreateArchitectureDraftRequest {
  const answer: ArchitectureDraftClarificationAnswer = {
    questionId: clarification.questionId,
    answer: answerText.trim()
  };
  const existingAnswers = request.clarificationAnswers ?? [];
  const answerIndex = existingAnswers.findIndex(
    (existingAnswer) => existingAnswer.questionId === clarification.questionId
  );

  return {
    ...request,
    clarificationAnswers:
      answerIndex === -1
        ? [...existingAnswers, answer]
        : existingAnswers.map((existingAnswer, index) =>
            index === answerIndex ? answer : existingAnswer
          )
  };
}

export function createArchitectureDraftClarificationMessage(
  clarification: ArchitectureDraftClarification
): string {
  const validationMessage = clarification.validationMessage?.trim();

  return validationMessage
    ? `${validationMessage}\n\n${clarification.question}`
    : clarification.question;
}

export type AcceptedArchitectureDraftClarificationSelection = {
  readonly label: string;
  readonly matchedSuggestion: boolean;
};

export function resolveAcceptedArchitectureDraftClarificationSelection(
  clarification: ArchitectureDraftClarification,
  answerText: string,
  response: CreateArchitectureDraftResponse
): AcceptedArchitectureDraftClarificationSelection | null {
  if (
    "status" in response && response.status === "needs_clarification"
    && response.questionId === clarification.questionId
  ) return null;
  const answer = answerText.trim();
  if (answer.length === 0) return null;
  const matchedSuggestion = findMatchingClarificationSuggestion(clarification, answer);
  return matchedSuggestion === null
    ? { label: answer, matchedSuggestion: false }
    : { label: matchedSuggestion, matchedSuggestion: true };
}

export function createArchitectureDraftClarificationAnswerReceipt(
  clarification: ArchitectureDraftClarification,
  answerText: string,
  response: CreateArchitectureDraftResponse
): string | null {
  const selection = resolveAcceptedArchitectureDraftClarificationSelection(
    clarification, answerText, response
  );
  if (selection === null) return null;
  const receiptLabel = selection.matchedSuggestion ? "선택 답변 반영" : "자연어 답변 반영";
  return `${receiptLabel}\n${clarification.question} → ${selection.label}`;
}

function findMatchingClarificationSuggestion(
  clarification: ArchitectureDraftClarification,
  answer: string
): string | null {
  const normalizedAnswer = normalizeClarificationText(answer);
  const exactSuggestion = clarification.suggestions.find(
    (suggestion) => normalizeClarificationText(suggestion) === normalizedAnswer
  );
  if (exactSuggestion !== undefined) return exactSuggestion;
  if (clarification.questionId === "website_type") {
    const semanticSuggestion = findWebsiteTypeSuggestion(clarification.suggestions, normalizedAnswer);
    if (semanticSuggestion !== null) return semanticSuggestion;
  }
  const answerTokens = extractMeaningfulClarificationTokens(normalizedAnswer);
  let bestMatch: { readonly score: number; readonly suggestion: string } | null = null;
  for (const suggestion of clarification.suggestions) {
    const suggestionTokens = extractMeaningfulClarificationTokens(normalizeClarificationText(suggestion));
    const score = suggestionTokens.filter((token) => answerTokens.includes(token)).length;
    if (score > 0 && (bestMatch === null || score > bestMatch.score)) {
      bestMatch = { score, suggestion };
    }
  }
  return bestMatch?.suggestion ?? null;
}

function findWebsiteTypeSuggestion(
  suggestions: readonly string[], normalizedAnswer: string
): string | null {
  const category = /(?:\bspa\b|react|vue|리액트|뷰)/iu.test(normalizedAnswer)
    ? ["spa", "single page", "react", "vue"]
    : /(?:\bapi\b|백엔드|backend|모바일 앱)/iu.test(normalizedAnswer)
      ? ["api", "백엔드", "backend"]
      : /(?:쇼핑|커머스|마켓|게시판|회원|로그인|예약|배달|포털|커뮤니티|소셜)/u.test(normalizedAnswer)
        ? ["동적", "쇼핑몰", "게시판", "회원"]
        : /(?:정적|블로그|포트폴리오|회사\s*소개|랜딩)/u.test(normalizedAnswer)
          ? ["정적", "블로그", "포트폴리오", "회사 소개"]
          : null;
  if (category === null) return null;
  return suggestions.find((suggestion) => {
    const normalizedSuggestion = normalizeClarificationText(suggestion);
    return category.some((term) => normalizedSuggestion.includes(term));
  }) ?? null;
}

function normalizeClarificationText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function extractMeaningfulClarificationTokens(value: string): string[] {
  const ignoredTokens = new Set([
    "같은", "그냥", "그리고", "등", "만들고", "만들어", "사이트", "싶어", "싶어요",
    "정도로", "해주세요"
  ]);
  return Array.from(new Set(
    (value.match(/[a-z0-9]+|[가-힣]{2,}/giu) ?? []).filter(
      (token) => token.length >= 2 && !ignoredTokens.has(token)
    )
  ));
}

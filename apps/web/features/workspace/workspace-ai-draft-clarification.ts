import type {
  ArchitectureDraftClarification,
  ArchitectureDraftClarificationAnswer,
  CreateArchitectureDraftResponse,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";
import { resolveArchitectureTechnologyStackCategory } from "@sketchcatch/types";

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
  const semanticSuggestion = findQuestionSpecificSuggestion(clarification, normalizedAnswer);
  if (semanticSuggestion !== null) return semanticSuggestion;
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

function findQuestionSpecificSuggestion(
  clarification: ArchitectureDraftClarification,
  normalizedAnswer: string
): string | null {
  let pattern: RegExp | null = null;
  const stackCategory = resolveArchitectureTechnologyStackCategory(
    clarification.questionId,
    normalizedAnswer
  );
  if (stackCategory !== null) {
    const stackPatternByCategory: Record<typeof stackCategory, RegExp> = {
      frontend_static: /(?:html|css|javascript|순수\s*웹)/iu,
      frontend_spa: /(?:spa|react|vue|angular|프레임워크)/iu,
      frontend_ssr: /(?:next|nuxt|ssr)/iu,
      frontend_mobile: /(?:모바일|웹뷰|네이티브)/iu,
      backend_simple_api: /(?:간단한\s*api|node|python\s*flask)/iu,
      backend_complex: /(?:복잡한\s*비즈니스\s*로직|spring\s*boot|django)/iu,
      backend_microservices: /(?:microservice|마이크로서비스)/iu
    };
    pattern = stackPatternByCategory[stackCategory];
  }
  if (pattern === null && clarification.questionId === "traffic") {
    const trafficScale = resolveExplicitTrafficScale(normalizedAnswer);
    if (trafficScale === "small") pattern = /(?:small|소규모)/iu;
    if (trafficScale === "medium") pattern = /(?:medium|중간\s*규모)/iu;
    if (trafficScale === "large") pattern = /(?:large|대규모)/iu;
  } else if (
    clarification.questionId === "backend"
    && /(?:spring\s*boot|스프링\s*부트|django|장고)/iu.test(normalizedAnswer)
  ) {
    pattern = /(?:complex\s*business|복잡한\s*비즈니스\s*로직)/iu;
  } else if (clarification.questionId === "region" && /(?:hong\s*kong|홍콩)/iu.test(normalizedAnswer)) {
    pattern = /(?:asia\s*pacific|아시아\s*태평양)/iu;
  } else if (
    clarification.questionId === "website_size"
    && /(?:간단|단순)(?:한)?\s*(?:웹)?사이트/u.test(normalizedAnswer)
  ) {
    pattern = /10mb\s*미만/iu;
  } else if (
    (clarification.questionId === "file_upload" || clarification.questionId === "realtime")
    && /^(?:(?:아니|아니요)|(?:필요\s*)?없(?:어|어요|음)|안\s*필요(?:해|해요)?)(?:[\s,.!]|$)/u.test(normalizedAnswer)
  ) {
    pattern = /^(?:없음|필요\s*없음)/u;
  }

  return pattern === null
    ? null
    : clarification.suggestions.find((suggestion) => pattern.test(suggestion)) ?? null;
}

function resolveExplicitTrafficScale(value: string): "small" | "medium" | "large" | null {
  const dailyCount = extractTrafficCount(
    value,
    /(?:일일|하루|daily|일(?=\s*\d))[^\d]{0,20}(\d[\d,]*)(?:\s*명)?(?:\s*(미만|이하|이상|\+))?/iu
  );
  const concurrentCount = extractTrafficCount(
    value,
    /(?:동시|동접|concurrent)[^\d]{0,20}(\d[\d,]*)(?:\s*명)?(?:\s*(미만|이하|이상|\+))?/iu
  );
  const scales = [
    dailyCount === null ? null : classifyTrafficCount(dailyCount, 100, 10_000),
    concurrentCount === null ? null : classifyTrafficCount(concurrentCount, 10, 500)
  ].filter((scale): scale is "small" | "medium" | "large" => scale !== null);

  if (scales.includes("large")) return "large";
  if (scales.includes("medium")) return "medium";
  return scales.includes("small") ? "small" : null;
}

function extractTrafficCount(value: string, pattern: RegExp): number | null {
  const match = value.match(pattern);
  const countText = match?.[1];
  if (countText === undefined) return null;
  const count = Number(countText.replaceAll(",", ""));
  if (!Number.isFinite(count)) return null;
  return match?.[2] === "미만" || match?.[2] === "이하" ? Math.max(0, count - 1) : count;
}

function classifyTrafficCount(
  count: number,
  smallUpperBound: number,
  largeLowerBound: number
): "small" | "medium" | "large" {
  if (count < smallUpperBound) return "small";
  return count < largeLowerBound ? "medium" : "large";
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

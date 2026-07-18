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

export function createArchitectureDraftClarificationAnswerReceipt(
  clarification: ArchitectureDraftClarification,
  answerText: string,
  response: CreateArchitectureDraftResponse
): string | null {
  if (
    "status" in response &&
    response.status === "needs_clarification" &&
    response.questionId === clarification.questionId
  ) {
    return null;
  }

  const answer = answerText.trim();
  if (answer.length === 0) {
    return null;
  }

  const normalizedAnswer = answer.normalize("NFKC").toLowerCase();
  const isSelectedAnswer = clarification.suggestions.some(
    (suggestion) => suggestion.normalize("NFKC").trim().toLowerCase() === normalizedAnswer
  );
  const receiptLabel = isSelectedAnswer
    ? "\uC120\uD0DD \uB2F5\uBCC0 \uBC18\uC601"
    : "\uC790\uC5F0\uC5B4 \uB2F5\uBCC0 \uBC18\uC601";

  return `${receiptLabel}\n${clarification.question} \u2192 ${answer}`;
}

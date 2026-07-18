import type {
  ArchitectureDraftClarification,
  ArchitectureDraftClarificationAnswer,
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

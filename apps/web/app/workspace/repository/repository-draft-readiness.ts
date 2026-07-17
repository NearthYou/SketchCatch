type RepositoryDraftQuestion = {
  readonly id: string;
};

export type RepositoryDraftBlockingIssue = {
  readonly field: "questions";
  readonly message: string;
};

export function getRepositoryDraftBlockingIssue(input: {
  readonly answers: Readonly<Record<string, string | boolean>>;
  readonly hasConnectedRepository: boolean;
  readonly questions: readonly RepositoryDraftQuestion[];
}): RepositoryDraftBlockingIssue | null {
  const hasUnansweredQuestion = input.questions.some(
    (question) => !hasRepositoryQuestionAnswer(input.answers[question.id])
  );

  if (hasUnansweredQuestion) {
    return {
      field: "questions",
      message: "모든 추가 질문에 답한 뒤 보드를 생성해주세요."
    };
  }

  return null;
}

function hasRepositoryQuestionAnswer(value: string | boolean | undefined): boolean {
  return typeof value === "boolean" || (typeof value === "string" && value.trim().length > 0);
}

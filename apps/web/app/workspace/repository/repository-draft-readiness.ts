type RepositoryDraftQuestion = {
  readonly id: string;
};

export type RepositoryDraftBlockingIssue = {
  readonly field: "ci_cd_connection" | "questions";
  readonly message: string;
};

export function getRepositoryDraftBlockingIssue(input: {
  readonly answers: Readonly<Record<string, string | boolean>>;
  readonly hasConnectedRepository: boolean;
  readonly questions: readonly RepositoryDraftQuestion[];
}): RepositoryDraftBlockingIssue | null {
  if (!input.hasConnectedRepository) {
    return {
      field: "ci_cd_connection",
      message: "CI/CD 연결을 완료해야 다음 단계로 이동할 수 있습니다."
    };
  }

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

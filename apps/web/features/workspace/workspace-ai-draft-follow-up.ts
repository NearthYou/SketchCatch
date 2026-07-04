import type {
  AiArchitectureDraftResult,
  ArchitectureGuardrailWarning,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";

export type ArchitectureDraftFollowUpKind =
  | "unsupported_requirement_substituted"
  | "partial_generation"
  | "scenario_conflict"
  | "low_budget_rds_cost";

export type ArchitectureDraftFollowUpSession = {
  readonly kind: ArchitectureDraftFollowUpKind;
  readonly originalRequest: CreateArchitectureDraftRequest;
  readonly pendingDraft: AiArchitectureDraftResult;
  readonly question: string;
  readonly suggestions: readonly string[];
};

export type ArchitectureDraftPreviewDecision =
  | {
      readonly action: "show_preview";
      readonly result: AiArchitectureDraftResult;
    }
  | {
      readonly action: "ask_follow_up";
      readonly session: ArchitectureDraftFollowUpSession;
    };

export type ArchitectureDraftFollowUpResolution =
  | {
      readonly action: "show_pending_draft";
    }
  | {
      readonly action: "regenerate";
      readonly request: CreateArchitectureDraftRequest;
    }
  | {
      readonly action: "ask_again";
      readonly question: string;
      readonly suggestions: readonly string[];
    };

export function planArchitectureDraftPreview(
  request: CreateArchitectureDraftRequest,
  result: AiArchitectureDraftResult
): ArchitectureDraftPreviewDecision {
  const kind = findDraftFollowUpKind(result.metadata.guardrailWarnings);

  if (kind === null) {
    return {
      action: "show_preview",
      result
    };
  }

  return {
    action: "ask_follow_up",
    session: {
      kind,
      originalRequest: request,
      pendingDraft: result,
      ...createFollowUpCopy(kind)
    }
  };
}

export function resolveArchitectureDraftFollowUpAnswer(
  session: ArchitectureDraftFollowUpSession,
  answerText: string
): ArchitectureDraftFollowUpResolution {
  if (session.kind === "low_budget_rds_cost" && prefersNoDatabase(answerText)) {
    return {
      action: "regenerate",
      request: {
        ...session.originalRequest,
        budgetLevel: "low",
        prompt: "Build a low budget single API server practice architecture",
        scenarioHint: "api_server"
      }
    };
  }

  if (isProceedAnswer(answerText)) {
    return {
      action: "show_pending_draft"
    };
  }

  return {
    action: "ask_again",
    question: session.question,
    suggestions: session.suggestions
  };
}

function findDraftFollowUpKind(
  warnings: readonly ArchitectureGuardrailWarning[] | undefined
): ArchitectureDraftFollowUpKind | null {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  if (warnings.some((warning) => warning.code === "unsupported_requirement_substituted")) {
    return "unsupported_requirement_substituted";
  }

  if (
    warnings.some(
      (warning) =>
        warning.code === "unsupported_resource_omitted" ||
        warning.code === "partial_generation"
    )
  ) {
    return "partial_generation";
  }

  if (warnings.some((warning) => warning.code === "scenario_conflict")) {
    return "scenario_conflict";
  }

  if (warnings.some((warning) => warning.code === "low_budget_rds_cost")) {
    return "low_budget_rds_cost";
  }

  return null;
}

function createFollowUpCopy(
  kind: ArchitectureDraftFollowUpKind
): Pick<ArchitectureDraftFollowUpSession, "question" | "suggestions"> {
  switch (kind) {
    case "unsupported_requirement_substituted":
      return {
        question:
          "질문: 요청하신 일부 요구사항은 아직 직접 지원하지 않아 지금 가능한 구조로 대체했습니다. 이대로 생성할까요, 아니면 원하는 조건을 더 알려주실까요?",
        suggestions: ["이대로 진행", "조건 다시 정리"]
      };
    case "partial_generation":
      return {
        question:
          "질문: 지원 가능한 부분만 초안으로 만들 수 있습니다. 제외된 요구사항을 다른 방식으로 대체할까요?",
        suggestions: ["지원 범위로 진행", "조건 다시 정리"]
      };
    case "scenario_conflict":
      return {
        question:
          "질문: 자연어 요구사항과 보조 선택이 서로 달라 보입니다. 자연어 기준으로 만든 초안으로 진행할까요?",
        suggestions: ["자연어 기준으로 진행", "조건 다시 정리"]
      };
    case "low_budget_rds_cost":
      return {
        question:
          "질문: DB가 포함되면 비용이 늘 수 있습니다. 낮은 예산을 우선해서 DB 없는 구조로 바꿀까요?",
        suggestions: ["DB 없이 다시 만들기", "DB 포함해서 진행"]
      };
  }
}

function prefersNoDatabase(answerText: string): boolean {
  const normalizedAnswer = normalizeAnswer(answerText);

  return (
    normalizedAnswer.includes("db 없는") ||
    normalizedAnswer.includes("db 없이") ||
    normalizedAnswer.includes("db없이") ||
    normalizedAnswer.includes("db 빼") ||
    normalizedAnswer.includes("db 제외") ||
    normalizedAnswer.includes("database 없는") ||
    normalizedAnswer.includes("database 없이") ||
    normalizedAnswer.includes("데이터베이스 없는") ||
    normalizedAnswer.includes("데이터베이스 없이") ||
    normalizedAnswer.includes("없는 구조") ||
    normalizedAnswer.includes("빼고") ||
    normalizedAnswer.includes("제외")
  );
}

function isProceedAnswer(answerText: string): boolean {
  const normalizedAnswer = normalizeAnswer(answerText);

  return (
    normalizedAnswer.includes("진행") ||
    normalizedAnswer.includes("그대로") ||
    normalizedAnswer.includes("포함") ||
    normalizedAnswer.includes("유지") ||
    normalizedAnswer.includes("괜찮") ||
    normalizedAnswer.includes("생성") ||
    normalizedAnswer.includes("만들")
  );
}

function normalizeAnswer(answerText: string): string {
  return answerText.trim().toLowerCase().replace(/\s+/g, " ");
}

import type {
  ArchitectureBoardCompilationDiagnostic,
  ArchitectureBoardCompilationProposal
} from "@sketchcatch/types";

const MAX_VISIBLE_DIAGNOSTICS = 3;

export type ReverseEngineeringCompilationReview = {
  readonly changeCount: number;
  readonly diagnostics: readonly ReverseEngineeringCompilationReviewDiagnostic[];
  readonly hiddenDiagnosticCount: number;
  readonly quality: ArchitectureBoardCompilationProposal["quality"];
  readonly referenceTemplateIds: readonly string[];
};

export type ReverseEngineeringCompilationReviewDiagnostic = Pick<
  ArchitectureBoardCompilationDiagnostic,
  "code" | "level"
> & {
  readonly summary: string;
  readonly message: string;
};

// 결과 패널은 제안 전체를 다시 해석하지 않고, 사용자가 확인할 최소 검토 정보만 뽑아냅니다.
export function createReverseEngineeringCompilationReview(
  proposal: ArchitectureBoardCompilationProposal
): ReverseEngineeringCompilationReview {
  return {
    changeCount: proposal.changes.length,
    diagnostics: proposal.diagnostics
      .slice(0, MAX_VISIBLE_DIAGNOSTICS)
      .map(presentCompilationDiagnostic),
    hiddenDiagnosticCount: Math.max(proposal.diagnostics.length - MAX_VISIBLE_DIAGNOSTICS, 0),
    quality: proposal.quality,
    referenceTemplateIds: proposal.provenance.referenceTemplateIds
  };
}

function presentCompilationDiagnostic(
  diagnostic: ArchitectureBoardCompilationDiagnostic
): ReverseEngineeringCompilationReviewDiagnostic {
  if (!diagnostic.code.startsWith("compiler.") || diagnostic.code.startsWith("compiler.context.")) {
    return {
      code: diagnostic.code,
      level: diagnostic.level,
      summary: diagnostic.summary,
      message: diagnostic.message
    };
  }

  const presentation = getGenericCompilerDiagnosticPresentation(diagnostic.code, diagnostic.level);

  return {
    code: diagnostic.code,
    level: diagnostic.level,
    ...presentation
  };
}

function getGenericCompilerDiagnosticPresentation(
  code: string,
  level: ArchitectureBoardCompilationDiagnostic["level"]
): Pick<ReverseEngineeringCompilationReviewDiagnostic, "summary" | "message"> {
  if (code.includes("semantic_operation")) {
    return {
      summary: "의미 변경 연산 검토 필요",
      message: "적용하지 못한 의미 변경의 대상 또는 중복 상태를 확인해 주세요."
    };
  }

  if (code.includes("containment") || code.includes("presentation")) {
    return {
      summary: "Resource 배치 관계 확인 필요",
      message: "Resource의 상위 배치 대상을 확인해 주세요."
    };
  }

  if (code.includes("relationship") || code.includes("terraform")) {
    return {
      summary: "Resource 연결 관계 확인 필요",
      message: "Resource 사이의 연결과 Terraform 참조를 확인해 주세요."
    };
  }

  if (code.includes("duplicate")) {
    return {
      summary: "중복 Resource 구성 확인 필요",
      message: "같은 Resource가 중복으로 표시되지 않는지 확인해 주세요."
    };
  }

  if (code.includes("configuration")) {
    return {
      summary: "Terraform 설정 정리 제안",
      message: "Terraform 설정 표현을 읽기 쉬운 형태로 정리했습니다."
    };
  }

  if (code.includes("empty_candidate")) {
    return {
      summary: "빈 Board 결과 확인 필요",
      message: "Resource가 Board에 표시되는지 확인해 주세요."
    };
  }

  return level === "info"
    ? {
        summary: "보드 구성 정리 제안",
        message: "보드 구성을 읽기 쉬운 형태로 정리했습니다."
      }
    : {
        summary: "보드 구성 확인 필요",
        message: "보드 구조와 Resource 연결을 확인해 주세요."
      };
}

export function formatCompilationScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

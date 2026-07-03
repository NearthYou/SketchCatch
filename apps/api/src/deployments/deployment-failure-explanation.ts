import type {
  AiTerraformStage,
  DeploymentFailureExplanation,
  DeploymentFailureStage,
  RiskLevel
} from "@sketchcatch/types";
import type { CreateLlmExplanation } from "../services/aiLlmExplanation.js";
import { explainTerraformError } from "../services/aiTerraformErrorExplanation.js";
import type { DeploymentLogRecord, DeploymentRecord } from "./deployment-service.js";
import { maskDeploymentMessage } from "./log-masking.js";

const maxFailureExcerptLength = 600;

export type CreateDeploymentFailureExplanationInput = {
  readonly deployment: DeploymentRecord;
  readonly logs: readonly DeploymentLogRecord[];
  readonly createLlmExplanation: CreateLlmExplanation;
};

export async function createDeploymentFailureExplanation(
  input: CreateDeploymentFailureExplanationInput
): Promise<DeploymentFailureExplanation> {
  const firstErrorLog = findFirstErrorLog(input.logs);
  const firstErrorLogMessage = normalizeFailureExcerpt(
    firstErrorLog?.message ?? input.deployment.errorSummary ?? "오류 로그가 아직 기록되지 않았습니다."
  );
  const cleanupRequired = isCleanupRequired(input.deployment);
  const stage = input.deployment.failureStage;
  const terraformExplanation = explainTerraformError({
    stage: toAiTerraformStage(stage),
    rawMessage: firstErrorLogMessage,
    relatedResourceId: firstErrorLog?.relatedResourceId ?? undefined
  });
  const nextActions = createDeploymentFailureNextActions({
    cleanupRequired,
    stage,
    terraformNextActions: terraformExplanation.nextActions
  });
  const summary = createDeploymentFailureSummary({
    cleanupRequired,
    firstErrorLogMessage,
    stage
  });
  const likelyCause = createLikelyCause(stage, terraformExplanation.likelyCause);
  const severity = createFailureSeverity(cleanupRequired, terraformExplanation.severity);
  const explanationForLlm = {
    ...terraformExplanation,
    severity,
    summary,
    likelyCause,
    nextActions
  };

  return {
    deploymentId: input.deployment.id,
    stage,
    severity,
    summary,
    likelyCause,
    nextActions,
    firstErrorLog: firstErrorLogMessage,
    cleanupRequired,
    llmExplanation: await input.createLlmExplanation({
      target: "terraform_error_explanation",
      result: explanationForLlm
    })
  };
}

function findFirstErrorLog(logs: readonly DeploymentLogRecord[]): DeploymentLogRecord | undefined {
  return [...logs]
    .sort((left, right) => left.sequence - right.sequence)
    .find((log) => log.level === "ERROR");
}

function normalizeFailureExcerpt(message: string): string {
  const maskedMessage = maskDeploymentMessage(message).replace(/\s+/g, " ").trim();

  if (maskedMessage.length <= maxFailureExcerptLength) {
    return maskedMessage;
  }

  return `${maskedMessage.slice(0, maxFailureExcerptLength - 1)}...`;
}

function toAiTerraformStage(stage: DeploymentFailureStage | null): AiTerraformStage {
  switch (stage) {
    case "plan":
      return "plan";
    case "apply":
    case "destroy":
      return "apply";
    case "init":
    case "validate":
    case "aws_connection":
    case "mock_run":
    case "approval":
    case null:
      return "validate";
  }
}

function isCleanupRequired(deployment: DeploymentRecord): boolean {
  return (
    deployment.status === "FAILED" &&
    (deployment.failureStage === "apply" ||
      deployment.failureStage === "destroy" ||
      deployment.stateObjectKey !== null)
  );
}

function createDeploymentFailureSummary(input: {
  readonly stage: DeploymentFailureStage | null;
  readonly firstErrorLogMessage: string;
  readonly cleanupRequired: boolean;
}): string {
  return [
    `${formatFailureStage(input.stage)} 단계에서 Direct Deployment가 실패했습니다.`,
    `첫 오류 로그: ${input.firstErrorLogMessage}`,
    `Cleanup 필요 여부: ${input.cleanupRequired ? "필요" : "현재 기록상 필수 아님"}`
  ].join(" ");
}

function createLikelyCause(
  stage: DeploymentFailureStage | null,
  terraformLikelyCause: string
): string {
  return `${formatFailureStage(stage)} 단계 기준 원인 후보: ${terraformLikelyCause}`;
}

function createDeploymentFailureNextActions(input: {
  readonly stage: DeploymentFailureStage | null;
  readonly cleanupRequired: boolean;
  readonly terraformNextActions: readonly string[];
}): string[] {
  const cleanupAction = input.cleanupRequired
    ? "Apply 또는 Destroy가 일부 진행됐을 수 있으므로 AWS 콘솔과 State object를 확인한 뒤 Cleanup Destroy Plan을 실행하세요."
    : "실제 AWS 리소스 생성 전 실패로 보이면 설정을 수정한 뒤 같은 단계부터 다시 실행하세요.";
  const stageAction = `${formatFailureStage(input.stage)} 단계의 로그와 errorSummary를 먼저 비교하세요.`;

  return dedupeNextActions([stageAction, cleanupAction, ...input.terraformNextActions]);
}

function createFailureSeverity(cleanupRequired: boolean, terraformSeverity: RiskLevel): RiskLevel {
  if (cleanupRequired) {
    return "high";
  }

  return terraformSeverity;
}

function dedupeNextActions(actions: readonly string[]): string[] {
  return [...new Set(actions.map((action) => action.trim()).filter(Boolean))];
}

function formatFailureStage(stage: DeploymentFailureStage | null): string {
  return stage ?? "unknown";
}

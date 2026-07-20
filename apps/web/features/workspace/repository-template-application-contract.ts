import type { RepositoryAnalysisAiHandoff } from "@sketchcatch/types";

export type RepositoryTemplateApplicationContract = {
  readonly includeFrontend: boolean;
  readonly containerPort: number;
  readonly healthCheckPath: string;
};

export function getRepositoryTemplateApplicationContract(
  handoff: RepositoryAnalysisAiHandoff | undefined
): RepositoryTemplateApplicationContract {
  const architectureFacts = handoff?.architectureFacts ?? [];
  const includeFrontend =
    handoff?.applicationUnits.some((unit) => unit.kind === "frontend") === true ||
    architectureFacts.some(
      (fact) => fact.kind === "frontend_delivery" && fact.value === "s3_cloudfront_static"
    ) === true;
  const healthCheck = architectureFacts.find((fact) => fact.kind === "health_check")?.value;
  const match = /^http:(\d{2,5})(\/[a-z0-9_./-]+)$/iu.exec(healthCheck ?? "");
  const parsedPort = match ? Number(match[1]) : 80;
  const containerPort = parsedPort >= 1 && parsedPort <= 65_535 ? parsedPort : 80;

  return {
    includeFrontend,
    containerPort,
    healthCheckPath: match?.[2] ?? "/"
  };
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureDiagnostic,
  DiagramJson,
  TerraformDiagnostic
} from "@sketchcatch/types";
import { runAiPreDeploymentCheck } from "../../../features/workspace/api";
import {
  addArchitectureDiagnosticsToPreDeploymentAnalysis,
  addTerraformDiagnosticsToPreDeploymentAnalysis,
  createPreDeploymentAnalysisFromArchitectureDiagnostics,
  createPreDeploymentAnalysisFromTerraformDiagnostics
} from "../../../features/workspace/pre-deployment-diagnostics";
import { convertDiagramJsonToArchitectureJson } from "../../../features/workspace/workspace-ai-diagram-adapter";
import { getSafetyGateState } from "../../../features/workspace/workspace-operations-state";

type SafetyRequestState = "idle" | "analyzing";

export type WorkspaceSafetyState = {
  readonly analysis: AiPreDeploymentAnalysisResult | null;
  readonly errorMessage: string;
  readonly gate: ReturnType<typeof getSafetyGateState>;
  readonly requestState: SafetyRequestState;
  readonly run: () => Promise<void>;
};

// 현재 Board와 Terraform 진단을 합쳐 배포 전 안전·비용 검사 상태를 관리합니다.
export function useWorkspaceSafety({
  architectureDiagnostics,
  diagram,
  terraformCode,
  terraformDiagnostics
}: {
  readonly architectureDiagnostics: readonly ArchitectureDiagnostic[];
  readonly diagram: DiagramJson;
  readonly terraformCode: string;
  readonly terraformDiagnostics: readonly TerraformDiagnostic[];
}): WorkspaceSafetyState {
  const [analysis, setAnalysis] = useState<AiPreDeploymentAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [requestState, setRequestState] = useState<SafetyRequestState>("idle");
  const gate = useMemo(() => getSafetyGateState(analysis), [analysis]);

  // Board나 Terraform 입력이 바뀌면 이전 검사 결과를 폐기해 오래된 통과 상태로 배포하지 못하게 합니다.
  useEffect(() => {
    setAnalysis(null);
    setErrorMessage("");
  }, [architectureDiagnostics, diagram, terraformCode, terraformDiagnostics]);

  // Terraform 오류는 즉시 막고, 그 외에는 Architecture 전체를 AI 검사 API에 전달합니다.
  const run = useCallback(async (): Promise<void> => {
    setRequestState("analyzing");
    setErrorMessage("");

    try {
      const errorDiagnostics = terraformDiagnostics.filter(
        (diagnostic) => diagnostic.severity === "error"
      );
      const architectureErrors = architectureDiagnostics.filter(
        (diagnostic) => diagnostic.severity === "error"
      );

      if (architectureErrors.length > 0) {
        setAnalysis(
          addTerraformDiagnosticsToPreDeploymentAnalysis(
            createPreDeploymentAnalysisFromArchitectureDiagnostics(architectureDiagnostics),
            terraformDiagnostics
          )
        );
        return;
      }

      if (errorDiagnostics.length > 0) {
        setAnalysis(
          addArchitectureDiagnosticsToPreDeploymentAnalysis(
            createPreDeploymentAnalysisFromTerraformDiagnostics(errorDiagnostics),
            architectureDiagnostics
          )
        );
        return;
      }

      const result = await runAiPreDeploymentCheck({
        architectureJson: convertDiagramJsonToArchitectureJson(diagram),
        ...(terraformCode.trim()
          ? { terraformFiles: [{ fileName: "main.tf", terraformCode }] }
          : {})
      });
      setAnalysis(
        addArchitectureDiagnosticsToPreDeploymentAnalysis(
          addTerraformDiagnosticsToPreDeploymentAnalysis(result, terraformDiagnostics),
          architectureDiagnostics
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message.trim()
          ? error.message
          : "배포 전 검사를 실행하지 못했습니다."
      );
    } finally {
      setRequestState("idle");
    }
  }, [architectureDiagnostics, diagram, terraformCode, terraformDiagnostics]);

  return { analysis, errorMessage, gate, requestState, run };
}

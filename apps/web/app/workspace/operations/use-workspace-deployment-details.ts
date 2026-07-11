"use client";

import { useEffect, useState } from "react";
import type {
  DeployedResource,
  Deployment,
  DeploymentFailureExplanation,
  TerraformOutput
} from "@sketchcatch/types";
import {
  getDeploymentFailureExplanation,
  listDeploymentResources,
  listTerraformOutputs
} from "../../../features/workspace/api";

export type WorkspaceDeploymentDetails = {
  readonly errorMessage: string;
  readonly explanation: DeploymentFailureExplanation | null;
  readonly outputs: readonly TerraformOutput[];
  readonly resources: readonly DeployedResource[];
};

// 선택한 배포의 생성 Resource, output, 실패 설명을 상세 화면에 맞게 읽습니다.
export function useWorkspaceDeploymentDetails(
  deployment: Deployment | null
): WorkspaceDeploymentDetails {
  const [errorMessage, setErrorMessage] = useState("");
  const [explanation, setExplanation] = useState<DeploymentFailureExplanation | null>(null);
  const [outputs, setOutputs] = useState<readonly TerraformOutput[]>([]);
  const [resources, setResources] = useState<readonly DeployedResource[]>([]);

  // 배포 선택이 바뀔 때 이전 상세를 비우고 새 실행의 결과만 가져옵니다.
  useEffect(() => {
    let cancelled = false;
    setErrorMessage("");
    setExplanation(null);
    setOutputs([]);
    setResources([]);
    if (!deployment) return;
    const selectedDeployment = deployment;

    async function loadDetails(): Promise<void> {
      try {
        const [loadedResources, loadedOutputs, loadedExplanation] = await Promise.all([
          listDeploymentResources(selectedDeployment.id),
          listTerraformOutputs(selectedDeployment.id),
          selectedDeployment.status === "FAILED"
            ? getDeploymentFailureExplanation(selectedDeployment.id)
            : Promise.resolve(null)
        ]);
        if (cancelled) return;
        setResources(loadedResources);
        setOutputs(loadedOutputs);
        setExplanation(loadedExplanation);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error && error.message.trim()
            ? error.message
            : "배포 상세를 불러오지 못했습니다."
        );
      }
    }

    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [deployment]);

  return { errorMessage, explanation, outputs, resources };
}

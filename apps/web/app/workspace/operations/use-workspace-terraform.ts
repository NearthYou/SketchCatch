"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DiagramJson,
  TerraformDiagnostic,
  TerraformDiagramChangeProposal
} from "@sketchcatch/types";
import {
  generateTerraformCode,
  syncTerraformToDiagram,
  validateTerraformCode
} from "../../../features/workspace/api";
import {
  applyTerraformSyncProposals,
  getTerraformSyncProposalId
} from "../../../features/workspace/terraform-sync-proposals";
import { getTerraformPreviewState } from "../../../features/workspace/workspace-operations-state";

type TerraformRequestState = "idle" | "generating" | "validating" | "syncing";

export type WorkspaceTerraformState = {
  readonly code: string;
  readonly diagnostics: readonly TerraformDiagnostic[];
  readonly errorMessage: string;
  readonly previewState: ReturnType<typeof getTerraformPreviewState>;
  readonly proposals: readonly TerraformDiagramChangeProposal[];
  readonly requestState: TerraformRequestState;
  readonly generate: () => Promise<string>;
  readonly setCode: (code: string) => void;
  readonly validate: () => Promise<void>;
  readonly inspectSync: () => Promise<void>;
  readonly applyProposals: (proposalIndexes: readonly number[]) => void;
};

// 현재 Board와 Terraform 코드 사이의 생성, 검증, 동기화 상태를 관리합니다.
export function useWorkspaceTerraform({
  applyDiagram,
  diagram,
  refreshRequestId
}: {
  readonly applyDiagram: (diagram: DiagramJson) => void;
  readonly diagram: DiagramJson;
  readonly refreshRequestId: number;
}): WorkspaceTerraformState {
  const [code, setCode] = useState("");
  const [diagnostics, setDiagnostics] = useState<readonly TerraformDiagnostic[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [generatedDiagram, setGeneratedDiagram] = useState<DiagramJson | null>(null);
  const [proposals, setProposals] = useState<readonly TerraformDiagramChangeProposal[]>([]);
  const [requestState, setRequestState] = useState<TerraformRequestState>("idle");
  const previewState = useMemo(
    () => getTerraformPreviewState({ currentDiagram: diagram, generatedDiagram, terraformCode: code }),
    [code, diagram, generatedDiagram]
  );

  // 현재 Board를 Terraform 코드로 다시 만들고 생성 시점의 Board를 함께 기억합니다.
  const generate = useCallback(async (): Promise<string> => {
    setRequestState("generating");
    setErrorMessage("");

    try {
      const generatedCode = await generateTerraformCode(diagram);
      setCode(generatedCode);
      setGeneratedDiagram(diagram);
      setDiagnostics([]);
      setProposals([]);
      return generatedCode;
    } catch (error) {
      setErrorMessage(toWorkspaceOperationError(error, "Terraform 코드를 만들지 못했습니다."));
      return "";
    } finally {
      setRequestState("idle");
    }
  }, [diagram]);

  // 편집 중인 Terraform 코드만 검사하고 실제 AWS Plan은 실행하지 않습니다.
  const validate = useCallback(async (): Promise<void> => {
    if (!code.trim()) return;
    setRequestState("validating");
    setErrorMessage("");

    try {
      const result = await validateTerraformCode(code);
      setDiagnostics(result.diagnostics);
    } catch (error) {
      setErrorMessage(toWorkspaceOperationError(error, "Terraform 코드를 검사하지 못했습니다."));
    } finally {
      setRequestState("idle");
    }
  }, [code]);

  // 코드 변경을 Board에 바로 덮지 않고 먼저 변경 제안 목록으로 가져옵니다.
  const inspectSync = useCallback(async (): Promise<void> => {
    if (!code.trim()) return;
    setRequestState("syncing");
    setErrorMessage("");

    try {
      const result = await syncTerraformToDiagram({ diagramJson: diagram, terraformCode: code });
      setDiagnostics(result.diagnostics);
      setProposals(result.proposals ?? []);
    } catch (error) {
      setErrorMessage(toWorkspaceOperationError(error, "Board 변경 제안을 만들지 못했습니다."));
    } finally {
      setRequestState("idle");
    }
  }, [code, diagram]);

  // 사용자가 고른 변경 제안만 현재 Board에 반영합니다.
  const applyProposals = useCallback((proposalIndexes: readonly number[]): void => {
    const approvedIds = proposalIndexes.flatMap((index) => {
      const proposal = proposals[index];
      return proposal ? [getTerraformSyncProposalId(proposal, index)] : [];
    });
    applyDiagram(applyTerraformSyncProposals(diagram, proposals, approvedIds));
    setProposals([]);
  }, [applyDiagram, diagram, proposals]);

  // Board 도구에서 Terraform 새로고침을 요청하면 같은 생성 흐름을 실행합니다.
  useEffect(() => {
    if (refreshRequestId === 0) return;
    void generate();
  }, [generate, refreshRequestId]);

  return {
    code,
    diagnostics,
    errorMessage,
    previewState,
    proposals,
    requestState,
    generate,
    setCode,
    validate,
    inspectSync,
    applyProposals
  };
}

// API 오류가 어떤 모양이어도 화면에는 이해할 수 있는 한 문장만 전달합니다.
function toWorkspaceOperationError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

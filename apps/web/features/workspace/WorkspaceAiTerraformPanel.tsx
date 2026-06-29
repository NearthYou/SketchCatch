"use client";

import { useState } from "react";
import type {
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  AiTerraformStage
} from "@sketchcatch/types";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  runAiTerraformErrorExplanation,
  runAiTerraformPreviewExplanation
} from "./api";
import {
  WorkspaceAiActionHeader,
  WorkspaceAiRequestMessage,
  WorkspaceAiSelect,
  WorkspaceAiTerraformErrorResult,
  WorkspaceAiTerraformPreviewResult
} from "./WorkspaceAiPanelPieces";
import type { AiRequestState } from "./WorkspaceAiPanelPieces";
import {
  DEFAULT_TERRAFORM_ERROR_MESSAGE,
  DEFAULT_TERRAFORM_PREVIEW_CODE,
  terraformStageOptions
} from "./workspace-ai-panel-options";
import styles from "./workspace.module.css";

// Terraform 관련 설명은 sw/ck 실행 흐름을 건드리지 않고 코드와 오류 메시지만 해석합니다.
export function WorkspaceAiTerraformPanel() {
  const [terraformCode, setTerraformCode] = useState(DEFAULT_TERRAFORM_PREVIEW_CODE);
  const [terraformPreview, setTerraformPreview] =
    useState<AiTerraformPreviewExplanationResult | null>(null);
  const [terraformPreviewState, setTerraformPreviewState] = useState<AiRequestState>("idle");
  const [terraformPreviewErrorMessage, setTerraformPreviewErrorMessage] = useState("");
  const [terraformErrorStage, setTerraformErrorStage] = useState<AiTerraformStage>("export");
  const [terraformErrorMessage, setTerraformErrorMessage] = useState(DEFAULT_TERRAFORM_ERROR_MESSAGE);
  const [terraformErrorResourceId, setTerraformErrorResourceId] = useState("");
  const [terraformErrorExplanation, setTerraformErrorExplanation] =
    useState<AiTerraformErrorExplanationResult | null>(null);
  const [terraformErrorState, setTerraformErrorState] = useState<AiRequestState>("idle");
  const [terraformErrorNotice, setTerraformErrorNotice] = useState("");

  async function runTerraformPreviewExplanation(): Promise<void> {
    const code = terraformCode.trim();

    if (code.length === 0) {
      setTerraformPreviewState("error");
      setTerraformPreviewErrorMessage("Terraform 코드를 먼저 입력해주세요.");
      return;
    }

    setTerraformPreviewState("loading");
    setTerraformPreviewErrorMessage("");

    try {
      const result = await runAiTerraformPreviewExplanation(code);
      setTerraformPreview(result);
      setTerraformPreviewState("idle");
    } catch (error) {
      setTerraformPreviewState("error");
      setTerraformPreviewErrorMessage(getApiErrorMessage(error, "Terraform Preview 설명 중 오류가 발생했습니다."));
    }
  }

  async function runTerraformErrorExplanation(): Promise<void> {
    const rawMessage = terraformErrorMessage.trim();

    if (rawMessage.length === 0) {
      setTerraformErrorState("error");
      setTerraformErrorNotice("Terraform 오류 메시지를 먼저 입력해주세요.");
      return;
    }

    const relatedResourceId = terraformErrorResourceId.trim();

    setTerraformErrorState("loading");
    setTerraformErrorNotice("");

    try {
      const result = await runAiTerraformErrorExplanation({
        rawMessage,
        ...(relatedResourceId.length > 0 ? { relatedResourceId } : {}),
        stage: terraformErrorStage
      });
      setTerraformErrorExplanation(result);
      setTerraformErrorState("idle");
    } catch (error) {
      setTerraformErrorState("error");
      setTerraformErrorNotice(getApiErrorMessage(error, "Terraform 오류 설명 중 오류가 발생했습니다."));
    }
  }

  return (
    <>
      <section className={styles.aiSection}>
        <WorkspaceAiActionHeader
          buttonLabel={terraformPreviewState === "loading" ? "설명 중" : "Terraform Preview 설명"}
          disabled={terraformPreviewState === "loading"}
          onClick={() => void runTerraformPreviewExplanation()}
          title="Terraform Preview 설명"
        />
        <label className={styles.aiField}>
          <span>Terraform Code</span>
          <textarea
            onChange={(event) => setTerraformCode(event.target.value)}
            rows={7}
            value={terraformCode}
          />
        </label>
        <WorkspaceAiRequestMessage state={terraformPreviewState} message={terraformPreviewErrorMessage} />
        {terraformPreview !== null ? (
          <WorkspaceAiTerraformPreviewResult preview={terraformPreview} />
        ) : (
          <p className={styles.aiHint}>Terraform 코드를 붙여 넣으면 감지된 Resource와 위험을 설명합니다.</p>
        )}
      </section>

      <section className={styles.aiSection}>
        <WorkspaceAiActionHeader
          buttonLabel={terraformErrorState === "loading" ? "설명 중" : "Terraform 오류 설명"}
          disabled={terraformErrorState === "loading"}
          onClick={() => void runTerraformErrorExplanation()}
          title="Terraform 오류 설명"
        />
        <WorkspaceAiSelect
          label="stage"
          onChange={setTerraformErrorStage}
          options={terraformStageOptions}
          value={terraformErrorStage}
        />
        <label className={styles.aiField}>
          <span>rawMessage</span>
          <textarea
            onChange={(event) => setTerraformErrorMessage(event.target.value)}
            rows={4}
            value={terraformErrorMessage}
          />
        </label>
        <label className={styles.aiField}>
          <span>relatedResourceId</span>
          <input
            onChange={(event) => setTerraformErrorResourceId(event.target.value)}
            placeholder="ec2-backend"
            value={terraformErrorResourceId}
          />
        </label>
        <WorkspaceAiRequestMessage state={terraformErrorState} message={terraformErrorNotice} />
        {terraformErrorExplanation !== null ? (
          <WorkspaceAiTerraformErrorResult explanation={terraformErrorExplanation} />
        ) : (
          <p className={styles.aiHint}>Terraform 실행 중 나온 오류 메시지를 붙여 넣으면 원인과 다음 행동을 설명합니다.</p>
        )}
      </section>
    </>
  );
}

"use client";

import { AlertCircle, CheckCircle2, GitCompareArrows, RefreshCw } from "lucide-react";
import type { DiagramEditorPanelContext } from "../../../features/diagram-editor";
import type { WorkspaceTerraformState } from "./use-workspace-terraform";
import styles from "./workspace-operations.module.css";

// Terraform 생성, 편집, Validate, Board 반영 제안을 한 화면에서 보여줍니다.
export function TerraformOperationsPanel({
  context,
  terraform
}: {
  readonly context: DiagramEditorPanelContext;
  readonly terraform: WorkspaceTerraformState;
}) {
  const isBusy = terraform.requestState !== "idle";
  const errorCount = terraform.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length;

  return (
    <div className={styles.panelBody}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Terraform Preview</p>
          <h2>Board를 코드로 확인</h2>
        </div>
        <span className={styles.statusText} data-tone={terraform.previewState}>
          {getTerraformPreviewLabel(terraform.previewState)}
        </span>
      </header>

      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          disabled={isBusy}
          onClick={() => void terraform.generate()}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={15} />
          {terraform.requestState === "generating" ? "생성 중" : "코드 생성"}
        </button>
        <button
          className={styles.secondaryButton}
          disabled={isBusy || !terraform.code.trim()}
          onClick={() => void terraform.validate()}
          type="button"
        >
          <CheckCircle2 aria-hidden="true" size={15} />
          Validate
        </button>
        <button
          className={styles.secondaryButton}
          disabled={isBusy || !terraform.code.trim()}
          onClick={() => void terraform.inspectSync()}
          type="button"
        >
          <GitCompareArrows aria-hidden="true" size={15} />
          Board 변경 확인
        </button>
      </div>

      {terraform.previewState === "stale" ? (
        <p className={styles.inlineNotice} data-tone="warning">
          Board가 바뀌었습니다. 배포 전에 코드를 다시 생성하세요.
        </p>
      ) : null}

      {terraform.errorMessage ? (
        <p className={styles.inlineNotice} data-tone="error">{terraform.errorMessage}</p>
      ) : null}

      <section className={styles.resultSection}>
        <div className={styles.sectionTitleRow}>
          <h3>Architecture 설계 진단</h3>
          <span>{terraform.architectureDiagnostics.length}개</span>
        </div>
        {terraform.architectureDiagnostics.length === 0 ? (
          <p className={styles.emptyText}>현재 Board에서 발견한 설계 문제가 없습니다.</p>
        ) : (
          <ul className={styles.issueList}>
            {terraform.architectureDiagnostics.map((diagnostic) => (
              <li
                data-severity={diagnostic.severity}
                key={`${diagnostic.ruleId}-${diagnostic.resourceNodeId}`}
              >
                <button
                  onClick={() => context.focusResourceNode(diagnostic.resourceNodeId)}
                  type="button"
                >
                  <AlertCircle aria-hidden="true" size={15} />
                  <span>
                    <strong>{diagnostic.summary}</strong>
                    {diagnostic.message}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <label className={styles.codeField}>
        <span>main.tf</span>
        <textarea
          aria-label="Terraform 코드"
          onChange={(event) => terraform.setCode(event.target.value)}
          placeholder="Board에서 Terraform 코드를 생성하세요."
          spellCheck={false}
          value={terraform.code}
        />
      </label>

      <section className={styles.resultSection}>
        <div className={styles.sectionTitleRow}>
          <h3>Validate 결과</h3>
          <span>{terraform.diagnostics.length}개</span>
        </div>
        {terraform.diagnostics.length === 0 ? (
          <p className={styles.emptyText}>아직 검사 결과가 없습니다.</p>
        ) : (
          <ul className={styles.issueList}>
            {terraform.diagnostics.map((diagnostic, index) => (
              <li data-severity={diagnostic.severity} key={`${diagnostic.message}-${index}`}>
                <button
                  disabled={!diagnostic.nodeId}
                  onClick={() => diagnostic.nodeId && context.focusResourceNode(diagnostic.nodeId)}
                  type="button"
                >
                  <AlertCircle aria-hidden="true" size={15} />
                  <span>
                    <strong>{diagnostic.severity === "error" ? "오류" : "확인"}</strong>
                    {formatDiagnosticLocation(diagnostic)} {diagnostic.message}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {errorCount > 0 ? (
          <p className={styles.inlineNotice} data-tone="error">
            오류를 해결하기 전에는 배포 artifact를 저장할 수 없습니다.
          </p>
        ) : null}
      </section>

      {terraform.proposals.length > 0 ? (
        <section className={styles.resultSection}>
          <div className={styles.sectionTitleRow}>
            <h3>Board 변경 제안</h3>
            <span>{terraform.proposals.length}개</span>
          </div>
          <ul className={styles.proposalList}>
            {terraform.proposals.map((proposal, index) => (
              <li key={`${proposal.kind}-${index}`}>{getProposalLabel(proposal.kind)}</li>
            ))}
          </ul>
          <button
            className={styles.primaryButton}
            onClick={() => terraform.applyProposals(terraform.proposals.map((_, index) => index))}
            type="button"
          >
            제안 모두 반영
          </button>
        </section>
      ) : null}
    </div>
  );
}

// 내부 상태 이름을 사용자가 바로 이해할 수 있는 표시 문구로 바꿉니다.
function getTerraformPreviewLabel(state: WorkspaceTerraformState["previewState"]): string {
  if (state === "current") return "최신";
  if (state === "stale") return "Board보다 오래됨";
  return "생성 전";
}

// Terraform 진단의 파일과 줄 정보가 있을 때만 메시지 앞에 붙입니다.
function formatDiagnosticLocation(
  diagnostic: WorkspaceTerraformState["diagnostics"][number]
): string {
  if (!diagnostic.line) return "";
  return `${diagnostic.sourceFileName ?? "main.tf"}:${diagnostic.line}`;
}

// 동기화 제안 종류를 코드 용어 대신 실제 Board 변화로 설명합니다.
function getProposalLabel(kind: WorkspaceTerraformState["proposals"][number]["kind"]): string {
  if (kind === "create_candidate") return "코드의 Resource를 Board에 추가";
  if (kind === "delete_candidate") return "Board의 Resource 삭제 검토";
  return "Resource 이름 변경";
}

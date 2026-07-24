import { useMemo, useState } from "react";
import type { ReverseEngineeringImportSuggestion } from "@sketchcatch/types";
import styles from "./workspace.module.css";

export type ReverseEngineeringImportSuggestionsPanelProps = {
  readonly importSuggestions: ReverseEngineeringImportSuggestion[];
};

type ImportSuggestionView = "cards" | "bulk";

// import 제안을 리소스별 카드와 전체 복사 보기로 나눠 보여줍니다.
export function ReverseEngineeringImportSuggestionsPanel({
  importSuggestions
}: ReverseEngineeringImportSuggestionsPanelProps) {
  const [activeView, setActiveView] = useState<ImportSuggestionView>("cards");
  const bulkText = useMemo(() => createBulkImportText(importSuggestions), [importSuggestions]);
  const handoffReadyCount = importSuggestions.filter((suggestion) => suggestion.handoffReady).length;

  return (
    <section className={styles.deploymentSection}>
      <h3>Terraform import 제안</h3>
      <div className={styles.deploymentPreflightStats}>
        <span>
          CI/CD handoff 준비
          <strong>{handoffReadyCount}</strong>
        </span>
        <span>
          전체 제안
          <strong>{importSuggestions.length}</strong>
        </span>
      </div>

      <div className={styles.deploymentApplyActions} role="tablist" aria-label="Import suggestion 보기">
        <button
          aria-selected={activeView === "cards"}
          className={styles.deploymentSecondaryButton}
          onClick={() => setActiveView("cards")}
          role="tab"
          type="button"
        >
          리소스별 카드
        </button>
        <button
          aria-selected={activeView === "bulk"}
          className={styles.deploymentSecondaryButton}
          onClick={() => setActiveView("bulk")}
          role="tab"
          type="button"
        >
          전체 복사
        </button>
      </div>

      {activeView === "cards" ? (
        <ImportSuggestionCards importSuggestions={importSuggestions} />
      ) : (
        <label className={styles.deploymentField}>
          전체 복사
          <textarea readOnly rows={10} value={bulkText} />
        </label>
      )}
    </section>
  );
}

// 리소스별로 import 명령어, Terraform 초안, handoff 상태를 보여줍니다.
function ImportSuggestionCards({
  importSuggestions
}: ReverseEngineeringImportSuggestionsPanelProps) {
  if (importSuggestions.length === 0) {
    return <p className={styles.deploymentHint}>가져오기 제안이 없습니다.</p>;
  }

  return (
    <ul className={styles.reverseResultList}>
      {importSuggestions.map((suggestion) => (
        <li key={suggestion.id} className={styles.reverseResultItem}>
          <strong>{suggestion.terraformAddress ?? suggestion.status}</strong>
          <span>{suggestion.importCommand ?? suggestion.reason ?? "수동 확인 필요"}</span>
          {suggestion.terraformBlockDraft ? <code>{suggestion.terraformBlockDraft}</code> : null}
          <span>
            CI/CD handoff 준비: {suggestion.handoffReady ? "가능" : "수동 확인 필요"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// 전체 복사 영역에 넣을 import 명령어와 Terraform block 초안을 만듭니다.
function createBulkImportText(importSuggestions: ReverseEngineeringImportSuggestion[]): string {
  const importCommands = importSuggestions.flatMap((suggestion) =>
    suggestion.importCommand ? [suggestion.importCommand] : []
  );
  const terraformBlocks = importSuggestions.flatMap((suggestion) =>
    suggestion.terraformBlockDraft ? [suggestion.terraformBlockDraft] : []
  );
  const handoffSummary = importSuggestions.map((suggestion) =>
    [
      `resourceId: ${suggestion.resourceId}`,
      `status: ${suggestion.status}`,
      `handoffReady: ${suggestion.handoffReady ? "yes" : "manual_review"}`
    ].join("\n")
  );

  return [
    "# terraform import 명령어",
    importCommands.join("\n") || "준비된 import 명령어가 없습니다.",
    "",
    "# Terraform block 초안",
    terraformBlocks.join("\n\n") || "준비된 Terraform block 초안이 없습니다.",
    "",
    "# CI/CD handoff 준비",
    handoffSummary.join("\n\n") || "handoff 준비 데이터가 없습니다."
  ].join("\n");
}

import type { TerraformSaveBanner } from "./terraform-panel-utils";
import styles from "./TerraformCodeStatus.module.css";

export type TerraformCodeStatusState = {
  readonly errorCount: number;
  readonly isSynced: boolean;
  readonly previewSummary: string;
  readonly saveBanner: TerraformSaveBanner | null;
  readonly statusMessage: string;
};

// Terraform Preview의 동기화, 미저장 변경, 오류 상태를 코드보다 먼저 보여줍니다.
export function TerraformCodeStatus({
  onOpenIssues,
  state
}: {
  readonly onOpenIssues: () => void;
  readonly state: TerraformCodeStatusState;
}) {
  return (
    <>
      <div className={styles.terraformStatusBar}>
        <span className={state.isSynced ? styles.terraformStatusSynced : styles.terraformStatusEdited}>
          {state.statusMessage}
        </span>
        <span>{state.previewSummary}</span>
      </div>

      {state.saveBanner ? (
        <div
          className={
            state.saveBanner.kind === "error"
              ? styles.terraformSaveBannerError
              : styles.terraformSaveBanner
          }
        >
          <span>
            {state.saveBanner.kind === "error"
              ? "Terraform 오류가 있습니다. Issues에서 확인하세요."
              : "저장하지 않은 Terraform 변경이 있습니다. Ctrl/⌘ + S로 저장하세요."}
          </span>
          <button data-terraform-issues-navigation onClick={onOpenIssues} type="button">
            Issues 보기
          </button>
        </div>
      ) : null}

      {state.errorCount > 0 ? (
        <div className={styles.terraformIssueBanner} role="status">
          <span>Terraform 오류가 있습니다. 자세한 내용은 Issues에서 확인하세요.</span>
          <button data-terraform-issues-navigation onClick={onOpenIssues} type="button">
            Issues 보기
          </button>
        </div>
      ) : null}
    </>
  );
}

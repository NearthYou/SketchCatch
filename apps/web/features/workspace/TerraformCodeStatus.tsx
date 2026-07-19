import type { TerraformSaveBanner } from "./terraform-panel-utils";
import styles from "./TerraformCodeStatus.module.css";

export type TerraformCodeStatusState = {
  readonly isSynced: boolean;
  readonly previewSummary: string;
  readonly saveBanner: TerraformSaveBanner | null;
  readonly statusMessage: string;
};

// Terraform Preview의 동기화와 저장 상태를 코드보다 먼저 보여줍니다.
export function TerraformCodeStatus({ state }: { readonly state: TerraformCodeStatusState }) {
  return (
    <>
      <div className={styles.terraformStatusBar}>
        <span className={state.isSynced ? styles.terraformStatusSynced : styles.terraformStatusEdited}>
          {state.statusMessage}
        </span>
        <span className={styles.terraformPreviewSummary}>{state.previewSummary}</span>
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
              ? state.saveBanner.message
              : "저장하지 않은 Terraform 변경이 있습니다. Ctrl/⌘ + S로 저장하세요."}
          </span>
        </div>
      ) : null}
    </>
  );
}

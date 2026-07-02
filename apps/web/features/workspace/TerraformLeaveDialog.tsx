import styles from "./workspace.module.css";

export function TerraformLeaveDialog({
  onContinue,
  onDiscard,
  onSave
}: {
  readonly onContinue: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
}) {
  return (
    <div className={styles.terraformDialogBackdrop} data-terraform-leave-dialog role="presentation">
      <section
        aria-labelledby="terraform-leave-title"
        aria-modal="true"
        className={styles.terraformDialog}
        role="dialog"
      >
        <h2 id="terraform-leave-title">나가기 전에 변경사항을 저장할까요?</h2>
        <p>저장하지 않은 Terraform 변경사항이 있습니다. 저장하지 않고 나가면 변경사항이 사라집니다.</p>
        <p>변경사항을 저장하시겠습니까?</p>
        <div className={styles.terraformDialogActions}>
          <button className={styles.terraformDialogDangerButton} onClick={onDiscard} type="button">
            저장하지 않고 나가기
          </button>
          <button className={styles.terraformDialogSecondaryButton} onClick={onContinue} type="button">
            계속 편집하기
          </button>
          <button className={styles.terraformDialogPrimaryButton} onClick={onSave} type="button">
            저장하고 나가기
          </button>
        </div>
      </section>
    </div>
  );
}

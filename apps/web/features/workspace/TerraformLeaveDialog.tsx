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
    <div className={styles.terraformDialogBackdrop} role="presentation">
      <section
        aria-labelledby="terraform-leave-title"
        aria-modal="true"
        className={styles.terraformDialog}
        role="dialog"
      >
        <h2 id="terraform-leave-title">Save changes before leaving?</h2>
        <p>You have unsaved Terraform changes that will be lost if you leave without saving.</p>
        <p>Do you want to save your changes?</p>
        <div className={styles.terraformDialogActions}>
          <button className={styles.terraformDialogDangerButton} onClick={onDiscard} type="button">
            Discard Changes
          </button>
          <button className={styles.terraformDialogSecondaryButton} onClick={onContinue} type="button">
            Continue editing
          </button>
          <button className={styles.terraformDialogPrimaryButton} onClick={onSave} type="button">
            Save Changes
          </button>
        </div>
      </section>
    </div>
  );
}

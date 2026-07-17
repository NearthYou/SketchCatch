import styles from "./workspace.module.css";
import { PROJECT_DRAFT_CONFLICT_COPY } from "./project-draft-conflict";

export function ProjectDraftConflictDialog({
  errorMessage,
  isReloading,
  onKeepEditing,
  onReloadLatest
}: {
  readonly errorMessage?: string | undefined;
  readonly isReloading: boolean;
  readonly onKeepEditing: () => void;
  readonly onReloadLatest: () => void;
}) {
  return (
    <div className={styles.terraformDialogBackdrop} role="presentation">
      <section
        aria-labelledby="project-draft-conflict-title"
        aria-modal="true"
        className={styles.terraformDialog}
        role="dialog"
      >
        <h2 id="project-draft-conflict-title">{PROJECT_DRAFT_CONFLICT_COPY.title}</h2>
        <p>{PROJECT_DRAFT_CONFLICT_COPY.description}</p>
        <p>{PROJECT_DRAFT_CONFLICT_COPY.reloadWarning}</p>
        {errorMessage ? (
          <p className={styles.terraformDialogError} role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className={styles.terraformDialogActions}>
          <button
            className={styles.terraformDialogSecondaryButton}
            disabled={isReloading}
            onClick={onKeepEditing}
            type="button"
          >
            {PROJECT_DRAFT_CONFLICT_COPY.keepEditingAction}
          </button>
          <button
            className={styles.terraformDialogPrimaryButton}
            disabled={isReloading}
            onClick={onReloadLatest}
            type="button"
          >
            {isReloading
              ? PROJECT_DRAFT_CONFLICT_COPY.reloadingAction
              : PROJECT_DRAFT_CONFLICT_COPY.reloadAction}
          </button>
        </div>
      </section>
    </div>
  );
}

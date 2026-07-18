import styles from "./workspace.module.css";

export function WorkspaceLoadingSkeleton({
  message = "Architecture Board를 불러오는 중입니다.",
  projectName = "Workspace"
}: {
  readonly message?: string | undefined;
  readonly projectName?: string | undefined;
}) {
  return (
    <main aria-busy="true" className={styles.workspaceLoadingShell} role="status">
      <p className={styles.workspaceLoadingVisuallyHidden}>{message}</p>
      <header className={styles.workspaceLoadingProjectBar} data-region="project-bar">
        <span className={styles.workspaceLoadingBrand} />
        <strong>{projectName}</strong>
        <span className={styles.workspaceLoadingActions} />
      </header>
      <aside className={styles.workspaceLoadingLeftPanel} data-region="left-panel">
        <span className={styles.workspaceLoadingTabs} />
        <span className={styles.workspaceLoadingSearch} />
        {Array.from({ length: 7 }, (_, index) => (
          <span className={styles.workspaceLoadingRow} key={index} />
        ))}
      </aside>
      <section className={styles.workspaceLoadingBoard} data-region="architecture-board">
        <span className={styles.workspaceLoadingToolbar} />
        <span className={styles.workspaceLoadingNode} />
      </section>
      <aside className={styles.workspaceLoadingRightPanel} data-region="right-panel">
        <span className={styles.workspaceLoadingTabs} />
        {Array.from({ length: 5 }, (_, index) => (
          <span className={styles.workspaceLoadingCard} key={index} />
        ))}
      </aside>
    </main>
  );
}

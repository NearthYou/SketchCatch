import type { CicdReadinessPresentation } from "./cicd-readiness-presentation";
import styles from "./delivery-center.module.css";

export function CicdStatusBoard({
  disabled,
  onActivateCurrentTask,
  presentation,
  suppressPrimaryAction = false
}: {
  readonly disabled: boolean;
  readonly onActivateCurrentTask: () => void;
  readonly presentation: CicdReadinessPresentation;
  readonly suppressPrimaryAction?: boolean | undefined;
}) {
  return (
    <section className={styles.statusBoard} aria-label="CI/CD 현재 작업과 진행 단계">
      <div className={styles.nextTask}>
        <div className={styles.nextTaskCopy}>
          <span>다음 작업</span>
          <strong>{presentation.currentTask.title}</strong>
          <p>{presentation.currentTask.description}</p>
        </div>
        {!suppressPrimaryAction ? (
          <button
            className={styles.nextTaskAction}
            disabled={disabled}
            onClick={onActivateCurrentTask}
            type="button"
          >
            {presentation.currentTask.actionLabel}
          </button>
        ) : null}
      </div>

      <nav className={styles.phaseProgress} aria-label="CI/CD 준비 진행 단계">
        <ol>
          {presentation.phases.map((phase) => {
            const isCurrent = phase.id === presentation.currentPhase;

            return (
              <li
                aria-label={`${phase.title} · ${phase.statusLabel}`}
                aria-current={isCurrent ? "step" : undefined}
                data-current={isCurrent}
                data-tone={phase.tone}
                key={phase.id}
              >
                <span className={styles.phaseMarker} aria-hidden="true">
                  {Number(phase.number)}
                </span>
                <span className={styles.phaseCopy}>
                  <span className={styles.phaseName}>{phase.title}</span>
                  <small className={styles.phaseStatus}>{phase.statusLabel}</small>
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
    </section>
  );
}

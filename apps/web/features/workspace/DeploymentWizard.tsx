import type { ReactNode } from "react";
import type { DeploymentBaseline } from "./deployment-baseline";
import type { DeploymentWizardState } from "./deployment-wizard-state";
import styles from "./deployment-wizard.module.css";

export type DeploymentWizardProps = {
  readonly baseline: DeploymentBaseline;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly projectName: string;
  readonly state: DeploymentWizardState;
};

export function DeploymentWizard({
  baseline,
  children,
  onClose,
  projectName,
  state
}: DeploymentWizardProps) {
  return (
    <div aria-label="Deployment Wizard" aria-modal="true" className={styles.overlay} role="dialog">
      <section className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <span>Deployment Wizard</span>
            <strong>{projectName}</strong>
            <code>{baseline.fingerprint.slice(0, 12)}</code>
          </div>
          <div className={styles.headerStatus} aria-live="polite">
            <span>현재 단계</span>
            <strong>{state.steps.find((step) => step.id === state.activeStepId)?.label}</strong>
          </div>
          <button className={styles.closeButton} onClick={onClose} type="button">
            Architecture로 돌아가기
          </button>
        </header>

        <nav aria-label="Deployment 단계" className={styles.stepRail}>
          <ol>
            {state.steps.map((step) => (
              <li data-state={step.state} key={step.id}>
                <div
                  aria-current={step.id === state.activeStepId ? "step" : undefined}
                  className={styles.stepItem}
                >
                  <span aria-hidden="true" className={styles.stepMarker} />
                  <span className={styles.stepCopy}>
                    <strong>{step.label}</strong>
                    <small>{step.description}</small>
                    {step.lockedReason ? <em>{step.lockedReason}</em> : null}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </nav>

        <main className={styles.body}>{children}</main>
      </section>
    </div>
  );
}

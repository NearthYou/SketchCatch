import type {
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  LlmExplanation,
  TerraformDiagnostic
} from "@sketchcatch/types";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Code2, ListChecks, X } from "lucide-react";
import {
  createTerraformIssuePresentation,
  createWorkspaceAiExplanationBadge,
  getWorkspaceAiResultSeverityLabel,
  createTerraformPreviewPresentation,
  type WorkspaceAiResultCheck
} from "./workspace-ai-result-presentation";
import {
  architectureDraftGenerationSteps,
  getArchitectureDraftGenerationProgressStep,
  getTerraformPreviewReviewProgressStep,
  terraformPreviewReviewSteps,
  type WorkspaceAiProgressStep
} from "./workspace-ai-chat-status";
import styles from "./workspace-ai-workbench.module.css";

export type AiRequestState = "idle" | "loading" | "error";

export function WorkspaceAiWorkbenchRequestMessage({
  message,
  state
}: {
  readonly message: string;
  readonly state: AiRequestState;
}) {
  if (state === "loading") {
    return (
      <p aria-live="polite" className={styles.requestMessage} role="status">
        요청 처리 중입니다.
      </p>
    );
  }

  if (state === "error") {
    return (
      <p className={`${styles.requestMessage} ${styles.requestError}`} role="alert">
        {message}
      </p>
    );
  }

  return null;
}

export function WorkspaceAiWorkbenchDraftProgress({
  currentStep,
  onCancel
}: {
  readonly currentStep?: number | undefined;
  readonly onCancel?: (() => void) | undefined;
}) {
  const elapsedMs = useWorkspaceAiProgressElapsed(currentStep === undefined);
  const resolvedCurrentStep = currentStep ?? getArchitectureDraftGenerationProgressStep(elapsedMs);

  return (
    <WorkspaceAiWorkbenchProgress
      currentStep={resolvedCurrentStep}
      notice="AI 응답이 도착하면 검증된 다이어그램 초안을 바로 표시합니다."
      onCancel={onCancel}
      steps={architectureDraftGenerationSteps}
      title="AI가 다이어그램을 구성하고 있습니다"
    />
  );
}

export function WorkspaceAiWorkbenchReviewProgress({ elapsedMs }: { readonly elapsedMs: number }) {
  return (
    <WorkspaceAiWorkbenchProgress
      currentStep={getTerraformPreviewReviewProgressStep(elapsedMs)}
      notice="Amazon Q 응답이 도착하면 여섯 가지 기준의 검토 결과를 바로 표시합니다."
      steps={terraformPreviewReviewSteps}
      title="Amazon Q 검토를 진행하고 있습니다"
    />
  );
}

function WorkspaceAiWorkbenchProgress({
  currentStep,
  notice,
  onCancel,
  steps,
  title
}: {
  readonly currentStep: number;
  readonly notice: string;
  readonly onCancel?: (() => void) | undefined;
  readonly steps: readonly WorkspaceAiProgressStep[];
  readonly title: string;
}) {
  const activeStep = steps[currentStep];

  return (
    <div className={styles.reviewProgress}>
      <div aria-live="polite" className={styles.reviewProgressHeader} role="status">
        <span aria-hidden="true" className={styles.reviewProgressSpinner} />
        <div>
          <strong>{title}</strong>
          <span>{activeStep?.description}</span>
        </div>
      </div>
      <ol className={styles.reviewProgressSteps}>
        {steps.map((step, index) => {
          const state =
            index < currentStep ? "complete" : index === currentStep ? "active" : "pending";

          return (
            <li
              aria-current={state === "active" ? "step" : undefined}
              data-state={state}
              key={step.label}
            >
              <span aria-hidden="true" className={styles.reviewProgressMarker} />
              <div>
                <strong>{step.label}</strong>
                <span>{step.description}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <div className={styles.reviewProgressFooter}>
        <p className={styles.reviewProgressNotice}>{notice}</p>
        {onCancel ? (
          <button className={styles.cancelButton} onClick={onCancel} type="button">
            <X aria-hidden="true" size={14} /> 요청 취소
          </button>
        ) : null}
      </div>
    </div>
  );
}

function useWorkspaceAiProgressElapsed(enabled = true): number {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 500);

    return () => window.clearInterval(timerId);
  }, [enabled]);

  return elapsedMs;
}

export function WorkspaceAiWorkbenchExplanation({
  explanation
}: {
  readonly explanation: LlmExplanation | undefined;
}) {
  if (explanation === undefined) {
    return null;
  }

  return (
    <section className={styles.explanation}>
      <div className={styles.explanationHeader}>
        <strong>AI 설명</strong>
        <span>{createWorkspaceAiExplanationBadge(explanation)}</span>
      </div>
      <p>{explanation.summary}</p>
      {explanation.wellArchitectedConclusion ? (
        <WorkspaceAiWorkbenchTechnicalList
          items={[explanation.wellArchitectedConclusion]}
          title="종합 평가"
        />
      ) : null}
      {explanation.highlights.length > 0 ? (
        <WorkspaceAiWorkbenchTechnicalList items={explanation.highlights} title="핵심" />
      ) : null}
    </section>
  );
}

export function WorkspaceAiWorkbenchTerraformPreviewResult({
  preview
}: {
  readonly preview: AiTerraformPreviewExplanationResult;
}) {
  const result = createTerraformPreviewPresentation(preview);

  return (
    <div className={styles.result}>
      <section className={styles.resultLead}>
        <h3>검토 요약</h3>
        <ul className={styles.reviewSummaryList}>
          {result.summaryItems.map((item) => (
            <li data-tone={item.tone} key={item.id}>
              <strong>{item.label}</strong>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <WorkspaceAiWorkbenchReviewChecks checks={result.checks} />
    </div>
  );
}
export function WorkspaceAiWorkbenchTerraformIssueResult({
  diagnostic,
  explanation,
  terraformCode
}: {
  readonly diagnostic: TerraformDiagnostic;
  readonly explanation: AiTerraformErrorExplanationResult;
  readonly terraformCode: string;
}) {
  const result = createTerraformIssuePresentation({ diagnostic, explanation, terraformCode });

  return (
    <div className={styles.result}>
      <section className={styles.resultLead}>
        <h3>{result.title}</h3>
        {result.summary ? <p>{result.summary}</p> : null}
      </section>

      <WorkspaceAiWorkbenchTechnicalDetails>
        <dl className={styles.technicalMeta}>
          <div>
            <dt>오류 위치</dt>
            <dd>{result.location}</dd>
          </div>
          <div>
            <dt>오류 유형</dt>
            <dd>
              <code>{result.technical.errorType}</code>
            </dd>
          </div>
        </dl>

        <section className={styles.technicalSection}>
          <strong>분석한 원인</strong>
          <p>{result.technical.likelyCause}</p>
        </section>

        <section className={styles.technicalSection}>
          <strong>Terraform 원문 오류</strong>
          <code className={styles.technicalRawError}>{result.technical.rawMessage}</code>
        </section>

        {result.technical.nextActions.length > 0 ? (
          <WorkspaceAiWorkbenchTechnicalList
            items={result.technical.nextActions}
            title="해결 절차"
          />
        ) : null}

        {result.technical.codeFrame.length > 0 ? (
          <div className={styles.codeFrame}>
            <strong>오류 주변 코드</strong>
            <pre>
              <code>
                {result.technical.codeFrame
                  .map((line) => {
                    const marker = line.isErrorLine ? ">" : " ";
                    return `${marker} ${String(line.lineNumber).padStart(3, " ")} | ${line.text}`;
                  })
                  .join("\n")}
              </code>
            </pre>
          </div>
        ) : null}
        {result.technical.codePreview ? (
          <div className={styles.codeDiff}>
            <section>
              <strong>현재 코드</strong>
              <pre>
                <code>{result.technical.codePreview.currentCode}</code>
              </pre>
            </section>
            <section>
              <strong>수정할 코드</strong>
              <pre>
                <code>
                  {formatTerraformIssuePreviewCode(result.technical.codePreview.nextCode)}
                </code>
              </pre>
            </section>
          </div>
        ) : null}
      </WorkspaceAiWorkbenchTechnicalDetails>
    </div>
  );
}

function WorkspaceAiWorkbenchReviewChecks({
  checks
}: {
  readonly checks: readonly WorkspaceAiResultCheck[];
}) {
  if (checks.length === 0) {
    return null;
  }

  return (
    <section className={styles.resultSection}>
      <div className={styles.resultSectionTitle}>
        <ListChecks aria-hidden="true" size={16} />
        <h4>확인할 점</h4>
      </div>
      <ul className={styles.reviewCheckList}>
        {checks.map((item) => (
          <li data-severity={item.severity} key={item.id}>
            <span aria-hidden="true" className={styles.checkMark} />
            <div>
              <div className={styles.reviewCheckHeading}>
                <strong>{item.label}</strong>
                {item.severity ? (
                  <span>{getWorkspaceAiResultSeverityLabel(item.severity)}</span>
                ) : null}
              </div>
              <dl className={styles.reviewCheckDetails}>
                <div>
                  <dt>
                    {item.severity === "high" || item.severity === "medium"
                      ? "문제"
                      : item.severity === "low"
                        ? "잘된 점"
                        : "내용"}
                  </dt>
                  <dd>{item.summary}</dd>
                </div>
                {item.action && item.action !== item.summary ? (
                  <div>
                    <dt>{item.severity === "low" ? "확인된 설정" : "필요한 조치"}</dt>
                    <dd>{item.action}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function _WorkspaceAiWorkbenchResultChecks({
  checks
}: {
  readonly checks: readonly WorkspaceAiResultCheck[];
}) {
  if (checks.length === 0) {
    return null;
  }

  return (
    <section className={styles.resultSection}>
      <div className={styles.resultSectionTitle}>
        <ListChecks aria-hidden="true" size={16} />
        <h4>확인할 점</h4>
      </div>
      <ul className={styles.checkList}>
        {checks.map((item) => (
          <li data-severity={item.severity} key={item.id}>
            <span aria-hidden="true" className={styles.checkMark} />
            <div>
              <div className={styles.checkHeading}>
                <strong>{item.label}</strong>
                {item.severity ? (
                  <span>{getWorkspaceAiResultSeverityLabel(item.severity)}</span>
                ) : null}
              </div>
              <p>{item.summary}</p>
              {item.action && item.action !== item.summary ? <p>{item.action}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function _WorkspaceAiWorkbenchNextStep({ children }: { readonly children: ReactNode }) {
  return (
    <section className={`${styles.resultSection} ${styles.nextStep}`}>
      <div className={styles.resultSectionTitle}>
        <ArrowRight aria-hidden="true" size={16} />
        <h4>다음 단계</h4>
      </div>
      <p>{children}</p>
    </section>
  );
}

function WorkspaceAiWorkbenchTechnicalDetails({ children }: { readonly children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details
      className={styles.technicalDetails}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary>
        <Code2 aria-hidden="true" size={16} />
        {isOpen ? "원문 분석 접기" : "원문 분석 다시 보기"}
      </summary>
      <div className={styles.technicalDetailsBody}>{children}</div>
    </details>
  );
}

function WorkspaceAiWorkbenchTechnicalList({
  items,
  title
}: {
  readonly items: readonly string[];
  readonly title: string;
}) {
  return (
    <div className={styles.technicalList}>
      <strong>{title}</strong>
      <ol>
        {items.map((item, index) => (
          <li key={`${title}-${index}-${item}`}>{item}</li>
        ))}
      </ol>
    </div>
  );
}

function formatTerraformIssuePreviewCode(code: string): string {
  return code.length > 0 ? code : "(이 코드 조각 삭제)";
}

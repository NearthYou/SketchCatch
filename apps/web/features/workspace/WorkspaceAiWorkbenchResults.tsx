import type {
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  LlmExplanation,
  TerraformDiagnostic
} from "@sketchcatch/types";
import type { ReactNode } from "react";
import { ArrowRight, Code2, ListChecks } from "lucide-react";
import {
  createTerraformIssuePresentation,
  createTerraformPreviewPresentation,
  createWorkspaceAiExplanationBadge,
  getWorkspaceAiResultSeverityLabel,
  type WorkspaceAiResultCheck
} from "./workspace-ai-result-presentation";
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
      {explanation.nextActions.length > 0 ? (
        <WorkspaceAiWorkbenchTechnicalList items={explanation.nextActions} title="다음 행동" />
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
        <p>{result.summary}</p>
      </section>

      <WorkspaceAiWorkbenchResultChecks checks={result.checks} />
      <WorkspaceAiWorkbenchNextStep>{result.nextStep}</WorkspaceAiWorkbenchNextStep>

      <WorkspaceAiWorkbenchTechnicalDetails>
        <dl className={styles.technicalMeta}>
          <div>
            <dt>원문 요약</dt>
            <dd>{result.technical.rawSummary}</dd>
          </div>
          <div>
            <dt>원문 권장 사항</dt>
            <dd>{result.technical.rawRecommendation}</dd>
          </div>
          {result.technical.provider ? (
            <div>
              <dt>응답 제공자</dt>
              <dd>{result.technical.provider}</dd>
            </div>
          ) : null}
        </dl>
        {result.technical.resources.length > 0 ? (
          <WorkspaceAiWorkbenchTechnicalList
            items={result.technical.resources}
            title="감지한 리소스"
          />
        ) : null}
        {result.technical.providerAttempts.length > 0 ? (
          <WorkspaceAiWorkbenchTechnicalList
            items={result.technical.providerAttempts}
            title="AI 제공자 시도 이력"
          />
        ) : null}
        {result.technical.findings.length > 0 ? (
          <WorkspaceAiWorkbenchTechnicalList
            items={result.technical.findings}
            title="점검 원문"
          />
        ) : null}
      </WorkspaceAiWorkbenchTechnicalDetails>
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
        <p>{result.summary}</p>
      </section>

      <WorkspaceAiWorkbenchResultChecks checks={result.checks} />
      <WorkspaceAiWorkbenchNextStep>{result.nextStep}</WorkspaceAiWorkbenchNextStep>

      <WorkspaceAiWorkbenchTechnicalDetails>
        <dl className={styles.technicalMeta}>
          <div>
            <dt>문제 위치</dt>
            <dd>{result.location}</dd>
          </div>
          <div>
            <dt>오류 유형</dt>
            <dd>{result.technical.errorType}</dd>
          </div>
          <div>
            <dt>원문 오류</dt>
            <dd>{result.technical.rawMessage}</dd>
          </div>
          <div>
            <dt>분석 원인</dt>
            <dd>{result.technical.likelyCause}</dd>
          </div>
          <div>
            <dt>분석 방식</dt>
            <dd>{result.technical.providerLabel}</dd>
          </div>
          {result.technical.providerNotice ? (
            <div>
              <dt>응답 상태</dt>
              <dd>{result.technical.providerNotice}</dd>
            </div>
          ) : null}
        </dl>

        {result.technical.nextActions.length > 0 ? (
          <WorkspaceAiWorkbenchTechnicalList
            items={result.technical.nextActions}
            title="상세 해결 절차"
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
                <code>{formatTerraformIssuePreviewCode(result.technical.codePreview.nextCode)}</code>
              </pre>
            </section>
          </div>
        ) : null}
      </WorkspaceAiWorkbenchTechnicalDetails>
    </div>
  );
}

function WorkspaceAiWorkbenchResultChecks({
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

function WorkspaceAiWorkbenchNextStep({ children }: { readonly children: ReactNode }) {
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
  return (
    <details className={styles.technicalDetails}>
      <summary>
        <Code2 aria-hidden="true" size={16} />
        기술 정보 보기
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
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function formatTerraformIssuePreviewCode(code: string): string {
  return code.length > 0 ? code : "(이 코드 조각 삭제)";
}

import Link from "next/link";
import type { SourceRepository, SourceRepositoryAnalysis } from "@sketchcatch/types";
import { listBoardTemplates } from "../../../../features/resource-settings/template-library";
import styles from "./repository-analysis-result.module.css";

type RepositoryAnalysisResultProps = {
  readonly analysis: SourceRepositoryAnalysis;
  readonly projectId: string;
  readonly repository: SourceRepository;
};

// 저장된 Repository Analysis를 성공과 실패 계약에 맞춰 읽기 쉬운 결과로 표시합니다.
export function RepositoryAnalysisResult({
  analysis,
  projectId,
  repository
}: RepositoryAnalysisResultProps) {
  const handoff = analysis.aiHandoff;
  const selectedTemplate =
    handoff.status === "template_selected"
      ? listBoardTemplates().find((template) => template.id === handoff.templateId) ?? null
      : null;

  return (
    <div className={styles.result}>
      <div className={styles.summary}>
        <article>
          <span>분석 repository</span>
          <strong>{repository.owner}/{repository.name}</strong>
        </article>
        <article>
          <span>Revision</span>
          <strong>{analysis.repositoryRevision}</strong>
        </article>
        <article>
          <span>분석 시각</span>
          <strong>{formatAnalyzedAt(analysis.analyzedAt)}</strong>
        </article>
      </div>

      <section className={styles.section} aria-labelledby="repository-template-selection-title">
        <h3 id="repository-template-selection-title">Template Selection</h3>
        {handoff.status === "template_selected" ? (
          <>
            <div className={styles.summary}>
              <article>
                <span>선택된 AWS Template</span>
                <strong>{selectedTemplate?.title ?? handoff.templateId}</strong>
              </article>
              <article>
                <span>Template ID</span>
                <strong>{handoff.templateId}</strong>
              </article>
            </div>
            <AnalysisTextList items={handoff.selectionReasons} />
            <Link
              className={`${styles.action} designDashboardPrimaryAction`}
              href={createWorkspaceHref(projectId, repository, handoff.templateId)}
            >
              선택한 Template을 AI 보완으로 넘기기
            </Link>
          </>
        ) : (
          <>
            <p className="dashboardMessage" role="status">
              지원하는 Template을 선택하지 못했습니다. AI가 임의로 다른 Template을 고르지 않습니다.
            </p>
            <AnalysisTextList items={handoff.mismatchReasons} />
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="repository-application-units-title">
        <h3 id="repository-application-units-title">Application Units</h3>
        {handoff.applicationUnits.length > 0 ? (
          <div className={styles.units}>
            {handoff.applicationUnits.map((unit) => (
              <article className={styles.unit} key={unit.id}>
                <span>{unit.kind}</span>
                <strong>{unit.rootPath}</strong>
                <span>
                  {unit.frameworks.length > 0 ? unit.frameworks.join(", ") : "framework 미감지"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p>감지된 Application Unit이 없습니다.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="repository-evidence-title">
        <h3 id="repository-evidence-title">분석 근거</h3>
        {handoff.evidence.length > 0 ? (
          <div className={styles.evidenceGrid}>
            {handoff.evidence.map((evidence) => (
              <article className={styles.evidence} key={`${evidence.kind}-${evidence.path}`}>
                <span>{formatEvidenceKind(evidence.kind)}</span>
                <strong>{evidence.path}</strong>
                <span>
                  {evidence.signals.length > 0 ? evidence.signals.join(", ") : "파일 경로 감지"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p>분석에 사용할 evidence를 찾지 못했습니다.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="repository-missing-evidence-title">
        <h3 id="repository-missing-evidence-title">감지하지 못한 evidence</h3>
        {handoff.missingEvidence.length > 0 ? (
          <div className={styles.chipList}>
            {handoff.missingEvidence.map((kind) => (
              <span className={styles.chip} key={kind}>{formatEvidenceKind(kind)}</span>
            ))}
          </div>
        ) : (
          <p>합의된 evidence 종류를 모두 감지했습니다.</p>
        )}
      </section>
    </div>
  );
}

// 선택 근거와 불일치 이유를 같은 목록 형태로 표시합니다.
function AnalysisTextList({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className={styles.list}>
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

// TemplateDefinition을 실제 Project Workspace 진입 파라미터로 연결합니다.
function createWorkspaceHref(
  projectId: string,
  repository: SourceRepository,
  templateId: string
): string {
  const params = new URLSearchParams({
    projectId,
    projectName: `${repository.owner}/${repository.name}`,
    sourceRepositoryId: repository.id,
    templateId
  });

  return `/workspace?${params.toString()}`;
}

// ISO 분석 시각을 한국어 화면에서 읽기 쉬운 절대 시각으로 변환합니다.
function formatAnalyzedAt(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

// 내부 evidence kind를 사용자에게 보이는 짧은 파일 종류 이름으로 바꿉니다.
function formatEvidenceKind(value: string): string {
  return value.replaceAll("_", " ");
}

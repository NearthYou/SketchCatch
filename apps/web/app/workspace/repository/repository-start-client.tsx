"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileSearch, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AiArchitectureDraftResult,
  DiagramJson,
  Project,
  RepositoryAnalysisTemplateId,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";
import { TemplateGallery } from "../../../components/templates/TemplateGallery";
import { AiDraftBoardPreview } from "../ai/ai-draft-board-preview";
import {
  analyzePublicSourceRepository,
  createGitHubArchitectureDraft,
  getProject,
  saveProjectDraft
} from "../../../features/workspace/api";
import {
  listBoardTemplates,
  type BoardTemplate
} from "../../../features/resource-settings/template-library";
import {
  convertDiagramJsonToArchitectureJson,
  getDiagramJsonForArchitectureDraft
} from "../../../features/workspace/workspace-ai-diagram-adapter";
import { getApiErrorMessage } from "../../../lib/api-client";
import styles from "./repository-start.module.css";

type RequestState = "idle" | "loading" | "error";

export function RepositoryStartClient({
  defaultBranch,
  projectId,
  repositoryUrl
}: {
  readonly defaultBranch: string;
  readonly projectId: string;
  readonly repositoryUrl: string;
}) {
  const router = useRouter();
  const templates = useMemo(() => listBoardTemplates(), []);
  const [project, setProject] = useState<Project | null>(null);
  const [analysis, setAnalysis] = useState<SourceRepositoryAnalysisResult | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [previewDiagram, setPreviewDiagram] = useState<DiagramJson | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadAnalysis(): Promise<void> {
      if (!projectId || !repositoryUrl) {
        setRequestState("error");
        setErrorMessage("프로젝트 또는 Repository 정보가 없습니다.");
        return;
      }

      try {
        const [projectResult, analysisResult] = await Promise.all([
          getProject(projectId),
          analyzePublicSourceRepository({ defaultBranch, repositoryUrl })
        ]);

        if (cancelled) return;
        setProject(projectResult);
        setAnalysis(analysisResult);
        setSelectedTemplateId(analysisResult.recommendedTemplateId);
        setRequestState("idle");
      } catch (error) {
        if (cancelled) return;
        setRequestState("error");
        setErrorMessage(getApiErrorMessage(error, "Repository를 분석하지 못했습니다."));
      }
    }

    void loadAnalysis();
    return () => {
      cancelled = true;
    };
  }, [defaultBranch, projectId, repositoryUrl]);

  async function createDraft(): Promise<void> {
    if (selectedTemplate === null || !isRepositoryTemplateId(selectedTemplate.id)) return;
    setRequestState("loading");
    setErrorMessage("");

    try {
      const result = await createGitHubArchitectureDraft({
        defaultBranch,
        repositoryUrl,
        selectedTemplateId: selectedTemplate.id
      });
      const templateDraft = createTemplateBasedRepositoryDraft(selectedTemplate, result);
      setDraft(templateDraft);
      setPreviewDiagram(getDiagramJsonForArchitectureDraft(templateDraft));
      setRequestState("idle");
    } catch (error) {
      setRequestState("error");
      setErrorMessage(getApiErrorMessage(error, "Architecture Draft를 만들지 못했습니다."));
    }
  }

  async function applyDraft(): Promise<void> {
    if (project === null || previewDiagram === null) return;
    setRequestState("loading");

    try {
      await saveProjectDraft({ diagramJson: previewDiagram, projectId: project.id });
      router.push(
        `/workspace?${new URLSearchParams({ projectId: project.id, projectName: project.name }).toString()}`
      );
    } catch (error) {
      setRequestState("error");
      setErrorMessage(getApiErrorMessage(error, "Architecture Draft를 저장하지 못했습니다."));
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <span>SOURCE REPOSITORY</span>
          <strong>{project?.name ?? "Repository Analysis"}</strong>
        </div>
        <Link href="/workspace/new">시작 방식 다시 선택</Link>
      </header>

      <div className={styles.layout}>
        <aside className={styles.analysisPanel}>
          <header>
            <span>REPOSITORY ANALYSIS</span>
            <h1>근거 확인</h1>
          </header>

          {requestState === "loading" && analysis === null ? (
            <div className={styles.status} role="status">
              <LoaderCircle aria-hidden="true" size={17} />
              Repository를 읽는 중입니다.
            </div>
          ) : null}

          {errorMessage ? (
            <div className={styles.error} role="alert">
              <TriangleAlert aria-hidden="true" size={17} />
              {errorMessage}
            </div>
          ) : null}

          {analysis ? (
            <>
              <section className={styles.evidenceSection}>
                <h2>읽은 파일</h2>
                <ul>
                  {analysis.evidenceFiles.map((file) => (
                    <li data-found={file.found} key={file.path}>
                      <FileSearch aria-hidden="true" size={14} />
                      {file.path}
                      <span>{file.found ? "확인" : "없음"}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={styles.evidenceSection}>
                <h2>찾은 근거</h2>
                <div className={styles.signals}>
                  {analysis.detectedSignals.length > 0
                    ? analysis.detectedSignals.map((signal) => <span key={signal}>{signal}</span>)
                    : "판단할 근거가 부족합니다."}
                </div>
                <p>{analysis.recommendationReason}</p>
              </section>

              <TemplateSelection
                onSelect={(templateId) => {
                  setSelectedTemplateId(templateId);
                  setDraft(null);
                  setPreviewDiagram(null);
                }}
                selectedTemplateId={selectedTemplateId}
                templates={templates}
              />

              <button
                className={styles.primaryButton}
                disabled={selectedTemplate === null || requestState === "loading"}
                onClick={() => void createDraft()}
                type="button"
              >
                {requestState === "loading" ? <LoaderCircle aria-hidden="true" size={16} /> : null}
                Architecture Draft 만들기
              </button>
            </>
          ) : null}
        </aside>

        <section className={styles.preview} aria-label="Repository Architecture Draft PREVIEW">
          {previewDiagram && draft ? (
            <>
              <header className={styles.previewHeader}>
                <span>ARCHITECTURE DRAFT</span>
                <h2>{draft.title}</h2>
              </header>
              <AiDraftBoardPreview diagram={previewDiagram} />
              <footer className={styles.previewFooter}>
                <span>적용하기 전에는 프로젝트 Board가 바뀌지 않습니다.</span>
                <button
                  disabled={requestState === "loading"}
                  onClick={() => void applyDraft()}
                  type="button"
                >
                  <Check aria-hidden="true" size={16} />
                  Board에 적용
                </button>
              </footer>
            </>
          ) : (
            <div className={styles.emptyPreview}>
              <span>PREVIEW</span>
              <strong>Template을 확인한 뒤 Draft를 만드세요.</strong>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function TemplateSelection({
  onSelect,
  selectedTemplateId,
  templates
}: {
  readonly onSelect: (templateId: string) => void;
  readonly selectedTemplateId: string | null;
  readonly templates: readonly BoardTemplate[];
}) {
  return (
    <section className={styles.templateSection}>
      <h2>Template Selection</h2>
      <TemplateGallery
        actionLabel="이 Template 선택"
        onSelect={onSelect}
        selectedTemplateId={selectedTemplateId}
        templates={templates}
      />
    </section>
  );
}

function isRepositoryTemplateId(value: string): value is RepositoryAnalysisTemplateId {
  return ["template-static-website", "template-api-db", "template-3tier"].includes(value);
}

function createTemplateBasedRepositoryDraft(
  template: BoardTemplate,
  recommendation: AiArchitectureDraftResult
): AiArchitectureDraftResult {
  return {
    ...recommendation,
    architectureJson: convertDiagramJsonToArchitectureJson(template.diagramJson),
    diagramJson: template.diagramJson,
    title: `${template.title} Architecture Draft`,
    metadata: {
      ...recommendation.metadata,
      assumptions: [
        `사용자가 선택한 ${template.title} Template을 기준 구조로 유지했습니다.`,
        ...recommendation.metadata.assumptions
      ]
    }
  };
}

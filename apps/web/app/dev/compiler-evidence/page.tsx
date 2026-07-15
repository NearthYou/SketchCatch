import { notFound } from "next/navigation";
import { WorkspaceDraftManager } from "../../../features/workspace";
import {
  collectArchitectureBoardCompilerEvidenceInput
} from "../../../features/architecture-board-compiler/architecture-board-compiler-evidence-source";
import { reviewArchitectureBoardTemplate } from "../../../features/architecture-board-compiler/template-review";

type CompilerEvidencePageProps = {
  readonly searchParams?: Promise<{
    readonly stage?: string | string[] | undefined;
    readonly templateId?: string | string[] | undefined;
  }>;
};

export default async function CompilerEvidencePage({ searchParams }: CompilerEvidencePageProps) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const params = await searchParams;
  const templateId = getSingleSearchParam(params?.templateId)?.trim();
  const stage = getSingleSearchParam(params?.stage);

  if (!templateId || (stage !== "before" && stage !== "after")) {
    notFound();
  }

  const template = collectArchitectureBoardCompilerEvidenceInput().availableTemplates.find(
    (candidate) => candidate.id === templateId
  );

  if (!template) {
    notFound();
  }

  const diagram =
    stage === "after"
      ? reviewArchitectureBoardTemplate(template.sourceDiagram).diagram
      : template.sourceDiagram;

  return (
    <WorkspaceDraftManager
      initialDiagramOverride={diagram}
      initialProjectName={`Compiler evidence: ${template.title} (${stage})`}
    />
  );
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

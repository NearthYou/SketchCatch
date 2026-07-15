import {
  adaptBrainboardTemplateSource,
  brainboardTemplateRegistry,
  buildTemplateDiagramJson,
  templateDefinitions
} from "@sketchcatch/types";
import type { ArchitectureBoardCompilerEvidenceInput } from "./architecture-board-compiler-evidence-report";

// 이 모듈은 CLI report에서만 source fixture를 읽는다. Browser Compiler는 generated knowledge artifact만 사용한다.
export function collectArchitectureBoardCompilerEvidenceInput(): ArchitectureBoardCompilerEvidenceInput {
  const availableTemplates = [
    ...templateDefinitions.map((definition) => ({
      id: `repository:${definition.id}`,
      title: definition.title,
      source: "repository" as const,
      sourceDiagram: buildTemplateDiagramJson(definition.id, {
        projectSlug: "compiler-evidence",
        shortId: definition.id
      })
    })),
    ...brainboardTemplateRegistry.flatMap((entry) =>
      entry.status === "available"
        ? [
            {
              id: `brainboard:${entry.id}`,
              title: entry.source.title,
              source: "brainboard" as const,
              sourceDiagram: adaptBrainboardTemplateSource(entry.source).diagramJson
            }
          ]
        : []
    )
  ].sort((left, right) => left.id.localeCompare(right.id));
  const unavailableTemplates = brainboardTemplateRegistry
    .flatMap((entry) =>
      entry.status === "unavailable"
        ? [
            {
              id: `brainboard:${entry.id}`,
              title: entry.evidence.title,
              source: "brainboard" as const,
              reason: entry.evidence.error
            }
          ]
        : []
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  return { availableTemplates, unavailableTemplates };
}

import type { AiArchitectureDraftResult, DiagramJson } from "@sketchcatch/types";
import { materializeResourceCatalogDiagramVisuals } from "../workspace/workspace-ai-diagram-adapter";
import {
  compileArchitectureBoard,
  type ArchitectureBoardCompilationProposal
} from "./architecture-board-compiler";

export function compileArchitectureDraftProposal(
  draft: AiArchitectureDraftResult,
  currentDiagram?: DiagramJson
): ArchitectureBoardCompilationProposal {
  const authoredDiagram =
    draft.metadata.authoredSourceId && draft.diagramJson
      ? materializeResourceCatalogDiagramVisuals(draft.diagramJson)
      : undefined;

  return compileArchitectureBoard({
    architecture: draft.architectureJson,
    currentDiagram: authoredDiagram ?? draft.diagramJson ?? currentDiagram,
    sourceDiagram: authoredDiagram,
    trigger: "ai-draft"
  });
}

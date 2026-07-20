import type { AiArchitectureDraftResult, DiagramJson } from "@sketchcatch/types";
import {
  compileArchitectureBoard,
  type ArchitectureBoardCompilationProposal
} from "./architecture-board-compiler";

export function compileArchitectureDraftProposal(
  draft: AiArchitectureDraftResult,
  currentDiagram?: DiagramJson
): ArchitectureBoardCompilationProposal {
  return compileArchitectureBoard({
    architecture: draft.architectureJson,
    currentDiagram: draft.diagramJson ?? currentDiagram,
    sourceDiagram: draft.metadata.authoredSourceId ? draft.diagramJson : undefined,
    trigger: "ai-draft"
  });
}

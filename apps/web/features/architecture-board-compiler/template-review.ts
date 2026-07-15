import type { DiagramJson } from "@sketchcatch/types";
import { convertDiagramJsonToArchitectureJson } from "../workspace/workspace-ai-diagram-adapter";
import {
  compileArchitectureBoard,
  type ArchitectureBoardCompilationProposal
} from "./architecture-board-compiler";

export function reviewArchitectureBoardTemplate(
  sourceDiagram: DiagramJson
): ArchitectureBoardCompilationProposal {
  return compileArchitectureBoard({
    architecture: convertDiagramJsonToArchitectureJson(sourceDiagram),
    currentDiagram: sourceDiagram,
    trigger: "template-review"
  });
}

import type { DiagramJson } from "@sketchcatch/types";
import { convertDiagramJsonToArchitectureJson } from "../workspace/workspace-ai-diagram-adapter";
import {
  compileArchitectureBoard,
  type ArchitectureBoardCompilationProposal
} from "./architecture-board-compiler";

export function createBoardAutoOrganizeProposal(
  currentDiagram: DiagramJson
): ArchitectureBoardCompilationProposal {
  return compileArchitectureBoard({
    architecture: convertDiagramJsonToArchitectureJson(currentDiagram),
    currentDiagram,
    trigger: "board-auto-organize"
  });
}

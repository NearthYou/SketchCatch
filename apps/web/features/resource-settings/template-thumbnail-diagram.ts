import type { DiagramJson } from "../../../../packages/types/src";
import { isBoardTemplateAvailable, listBoardTemplates } from "./template-library";

export function createTemplateThumbnailDiagram(templateId: string): DiagramJson | null {
  const template = listBoardTemplates().find(
    (candidate) => candidate.id === templateId && isBoardTemplateAvailable(candidate)
  );

  return template && isBoardTemplateAvailable(template)
    ? structuredClone(template.diagramJson)
    : null;
}

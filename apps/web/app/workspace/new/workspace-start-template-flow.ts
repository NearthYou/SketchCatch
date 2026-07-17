import {
  getBoardTemplateVersion,
  isBoardTemplateAvailable,
  type AvailableBoardTemplate,
  type BoardTemplate
} from "../../../features/resource-settings/template-library";
import { markTerraformSourceAuthoritative } from "../../../features/workspace/terraform-panel-utils";

export type WorkspaceStartTemplateSelection = {
  readonly templateId: string | null;
  readonly templateVersion: string | null;
};

export function createWorkspaceStartTemplateSelection(
  template: AvailableBoardTemplate | null
): WorkspaceStartTemplateSelection {
  return template
    ? {
        templateId: template.id,
        templateVersion: getBoardTemplateVersion(template)
      }
    : { templateId: null, templateVersion: null };
}

/** A persisted selection must match the current immutable template revision before it is reused. */
export function resolveWorkspaceStartTemplate(
  templates: readonly BoardTemplate[],
  selection: WorkspaceStartTemplateSelection
): AvailableBoardTemplate | null {
  if (!selection.templateId) {
    return null;
  }

  const template = templates.find((candidate) => candidate.id === selection.templateId);

  if (!template || !isBoardTemplateAvailable(template)) {
    return null;
  }

  return selection.templateVersion === null ||
    selection.templateVersion === getBoardTemplateVersion(template)
    ? template
    : null;
}

/** The project is created only once, then receives the exact selected Board snapshot and source files. */
export function createTemplateProjectDraft({
  projectId,
  template
}: {
  readonly projectId: string;
  readonly template: AvailableBoardTemplate;
}) {
  return {
    diagramJson:
      template.terraformFiles.length > 0
        ? markTerraformSourceAuthoritative(template.diagramJson)
        : template.diagramJson,
    projectId,
    terraformFiles: template.terraformFiles.map((file) => ({ ...file }))
  };
}

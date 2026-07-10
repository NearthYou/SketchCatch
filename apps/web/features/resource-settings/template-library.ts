import {
  buildTemplateDiagramJson,
  templateDefinitions,
  type DiagramJson
} from "../../../../packages/types/src";

export const TEMPLATE_OVERWRITE_BACKUP_STORAGE_KEY = "sketchcatch.templateOverwriteBackups";

export type BoardTemplate = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly diagramJson: DiagramJson;
};

export type TemplateOverwriteBackup = {
  readonly id: string;
  readonly createdAt: string;
  readonly templateId: string;
  readonly templateTitle: string;
  readonly diagramJson: DiagramJson;
};

type TemplateStorage = Pick<Storage, "getItem" | "setItem">;

const MAX_TEMPLATE_BACKUPS = 10;

const boardTemplates: readonly BoardTemplate[] = templateDefinitions.map((definition) => ({
  id: definition.id,
  title: definition.title,
  description: definition.description,
  tags: definition.tags,
  diagramJson: buildTemplateDiagramJson(definition.id, {
    projectSlug: "sketchcatch",
    shortId: definition.id
  })
}));

// 페이지와 보드 모달이 같은 템플릿 목록을 쓰도록 한 곳에서 목록을 제공합니다.
export function listBoardTemplates(): readonly BoardTemplate[] {
  return boardTemplates.map((template) => ({
    ...template,
    diagramJson: cloneDiagramJson(template.diagramJson)
  }));
}

export function buildBoardTemplateDiagram(
  templateId: string | undefined,
  input: { readonly projectSlug: string; readonly shortId: string }
): DiagramJson | undefined {
  const definition = templateDefinitions.find((candidate) => candidate.id === templateId);

  return definition ? buildTemplateDiagramJson(definition.id, input) : undefined;
}

// 템플릿으로 덮어쓰기 직전에 현재 보드를 백업하고, 적용할 템플릿 보드를 돌려줍니다.
export function applyTemplateToDiagramWithBackup({
  currentDiagram,
  nowIso,
  storage,
  template
}: {
  readonly currentDiagram: DiagramJson;
  readonly nowIso: string;
  readonly storage: TemplateStorage;
  readonly template: BoardTemplate;
}): DiagramJson {
  const backups = readTemplateOverwriteBackups(storage);
  const backup: TemplateOverwriteBackup = {
    createdAt: nowIso,
    diagramJson: cloneDiagramJson(currentDiagram),
    id: `template-backup-${nowIso}`,
    templateId: template.id,
    templateTitle: template.title
  };

  storage.setItem(
    TEMPLATE_OVERWRITE_BACKUP_STORAGE_KEY,
    JSON.stringify([backup, ...backups].slice(0, MAX_TEMPLATE_BACKUPS))
  );

  return cloneDiagramJson(template.diagramJson);
}

// localStorage에 저장된 템플릿 덮어쓰기 백업을 읽습니다.
export function readTemplateOverwriteBackups(storage: TemplateStorage): readonly TemplateOverwriteBackup[] {
  const rawValue = storage.getItem(TEMPLATE_OVERWRITE_BACKUP_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue.filter(isTemplateOverwriteBackup) : [];
  } catch {
    return [];
  }
}

function cloneDiagramJson(diagramJson: DiagramJson): DiagramJson {
  return {
    ...diagramJson,
    edges: diagramJson.edges.map((edge) => ({ ...edge, style: edge.style ? { ...edge.style } : undefined })),
    nodes: diagramJson.nodes.map((node) => ({
      ...node,
      metadata: node.metadata ? { ...node.metadata } : undefined,
      parameters: node.parameters ? { ...node.parameters } : undefined,
      position: { ...node.position },
      size: { ...node.size },
      style: node.style ? { ...node.style } : undefined
    })),
    variables: diagramJson.variables?.map((variable) => ({ ...variable })),
    viewport: { ...diagramJson.viewport }
  };
}

function isTemplateOverwriteBackup(value: unknown): value is TemplateOverwriteBackup {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TemplateOverwriteBackup>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.templateId === "string" &&
    typeof candidate.templateTitle === "string" &&
    isDiagramJson(candidate.diagramJson)
  );
}

function isDiagramJson(value: unknown): value is DiagramJson {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DiagramJson>;
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges) && Boolean(candidate.viewport);
}

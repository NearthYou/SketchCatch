import type { DiagramJson } from "../../../../packages/types/src";

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

export type BoardTemplateSort = "recommended" | "name" | "resources";

export type BoardTemplateFilter = {
  readonly query: string;
  readonly sort: BoardTemplateSort;
  readonly tag: string;
};

type TemplateStorage = Pick<Storage, "getItem" | "setItem">;

const MAX_TEMPLATE_BACKUPS = 10;

const boardTemplates: readonly BoardTemplate[] = [
  {
    id: "template-static-website",
    title: "S3 정적 웹사이트",
    description: "S3와 CloudFront를 중심으로 정적 웹사이트 구조를 빠르게 시작합니다.",
    tags: ["S3", "CloudFront", "정적 웹사이트"],
    diagramJson: {
      nodes: [
        createTemplateNode({
          id: "template-static-s3",
          label: "S3 Bucket",
          position: { x: 240, y: 220 },
          type: "aws_s3_bucket"
        }),
        createTemplateNode({
          id: "template-static-cloudfront",
          label: "CloudFront",
          position: { x: 480, y: 220 },
          type: "aws_cloudfront_distribution"
        })
      ],
      edges: [
        {
          id: "template-static-s3-cloudfront",
          label: "origin",
          sourceNodeId: "template-static-s3",
          targetNodeId: "template-static-cloudfront",
          type: "smoothstep"
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
  },
  {
    id: "template-api-db",
    title: "DB 포함 백엔드 API",
    description: "VPC 안에 Subnet, EC2, RDS를 배치한 기본 백엔드 구조입니다.",
    tags: ["VPC", "EC2", "RDS", "API"],
    diagramJson: {
      nodes: [
        createTemplateNode({
          id: "template-api-vpc",
          kind: "design",
          label: "VPC",
          position: { x: 120, y: 120 },
          size: { height: 420, width: 680 },
          type: "aws_vpc",
          zIndex: 0
        }),
        createTemplateNode({
          id: "template-api-subnet",
          kind: "design",
          label: "Public Subnet",
          metadata: { parentAreaNodeId: "template-api-vpc" },
          position: { x: 200, y: 220 },
          size: { height: 240, width: 520 },
          type: "aws_subnet",
          zIndex: 1
        }),
        createTemplateNode({
          id: "template-api-ec2",
          label: "EC2 API Server",
          metadata: { parentAreaNodeId: "template-api-subnet" },
          position: { x: 280, y: 300 },
          type: "aws_instance",
          zIndex: 2
        }),
        createTemplateNode({
          id: "template-api-rds",
          label: "RDS Database",
          metadata: { parentAreaNodeId: "template-api-subnet" },
          position: { x: 500, y: 300 },
          type: "aws_db_instance",
          zIndex: 2
        })
      ],
      edges: [
        {
          id: "template-api-ec2-rds",
          label: "connects",
          sourceNodeId: "template-api-ec2",
          targetNodeId: "template-api-rds",
          type: "smoothstep"
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
  },
  {
    id: "template-3tier",
    title: "ALB + ASG + RDS 3계층",
    description: "데모 시나리오에 맞춘 3계층 웹 서비스 기본 구조입니다.",
    tags: ["ALB", "ASG", "RDS", "3계층"],
    diagramJson: {
      nodes: [
        createTemplateNode({
          id: "template-3tier-vpc",
          kind: "design",
          label: "VPC",
          position: { x: 100, y: 100 },
          size: { height: 500, width: 820 },
          type: "aws_vpc",
          zIndex: 0
        }),
        createTemplateNode({
          id: "template-3tier-alb",
          label: "ALB",
          metadata: { parentAreaNodeId: "template-3tier-vpc" },
          position: { x: 220, y: 220 },
          type: "aws_lb",
          zIndex: 1
        }),
        createTemplateNode({
          id: "template-3tier-asg",
          kind: "design",
          label: "Auto Scaling Group",
          metadata: { parentAreaNodeId: "template-3tier-vpc" },
          position: { x: 420, y: 190 },
          size: { height: 220, width: 280 },
          type: "aws_autoscaling_group",
          zIndex: 1
        }),
        createTemplateNode({
          id: "template-3tier-ec2",
          label: "EC2 Instance",
          metadata: { parentAreaNodeId: "template-3tier-asg" },
          position: { x: 500, y: 270 },
          type: "aws_instance",
          zIndex: 2
        }),
        createTemplateNode({
          id: "template-3tier-rds",
          label: "RDS",
          metadata: { parentAreaNodeId: "template-3tier-vpc" },
          position: { x: 760, y: 280 },
          type: "aws_db_instance",
          zIndex: 1
        })
      ],
      edges: [
        {
          id: "template-3tier-alb-asg",
          label: "routes",
          sourceNodeId: "template-3tier-alb",
          targetNodeId: "template-3tier-asg",
          type: "smoothstep"
        },
        {
          id: "template-3tier-ec2-rds",
          label: "reads/writes",
          sourceNodeId: "template-3tier-ec2",
          targetNodeId: "template-3tier-rds",
          type: "smoothstep"
        }
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 }
    }
  }
];

// 페이지와 보드 모달이 같은 템플릿 목록을 쓰도록 한 곳에서 목록을 제공합니다.
export function listBoardTemplates(): readonly BoardTemplate[] {
  return boardTemplates.map((template) => ({
    ...template,
    diagramJson: cloneDiagramJson(template.diagramJson)
  }));
}

// Template 목록에서 검색어와 tag를 적용하고 사용자가 고른 순서로 정렬합니다.
export function filterBoardTemplates(
  templates: readonly BoardTemplate[],
  filter: BoardTemplateFilter
): readonly BoardTemplate[] {
  const query = filter.query.trim().toLocaleLowerCase("ko-KR");
  const filteredTemplates = templates.filter((template) => {
    const matchesTag = filter.tag === "all" || template.tags.includes(filter.tag);
    const searchableText = [template.title, template.description, ...template.tags]
      .join(" ")
      .toLocaleLowerCase("ko-KR");

    return matchesTag && (query.length === 0 || searchableText.includes(query));
  });

  if (filter.sort === "name") {
    return [...filteredTemplates].sort((left, right) => left.title.localeCompare(right.title, "ko-KR"));
  }

  if (filter.sort === "resources") {
    return [...filteredTemplates].sort(
      (left, right) => right.diagramJson.nodes.length - left.diagramJson.nodes.length
    );
  }

  return filteredTemplates;
}

// Template 필터에 보여줄 tag를 중복 없이 이름순으로 만듭니다.
export function listBoardTemplateTags(templates: readonly BoardTemplate[]): readonly string[] {
  return [...new Set(templates.flatMap((template) => template.tags))].sort((left, right) =>
    left.localeCompare(right, "ko-KR")
  );
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

function createTemplateNode({
  id,
  kind = "resource",
  label,
  metadata,
  position,
  size = { height: 112, width: 112 },
  type,
  zIndex = 1
}: {
  readonly id: string;
  readonly kind?: "resource" | "design" | undefined;
  readonly label: string;
  readonly metadata?: { readonly parentAreaNodeId?: string | undefined } | undefined;
  readonly position: { readonly x: number; readonly y: number };
  readonly size?: { readonly height: number; readonly width: number } | undefined;
  readonly type: string;
  readonly zIndex?: number | undefined;
}): DiagramJson["nodes"][number] {
  return {
    id,
    kind,
    label,
    locked: false,
    metadata,
    position,
    size,
    type,
    zIndex
  };
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

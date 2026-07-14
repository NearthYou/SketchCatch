import type { ArchitectureJson, DiagramJson, DiagramNode, ResourceItem } from "@sketchcatch/types";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { getResourceNodeVisualBounds } from "../diagram-editor/resource-node-visual-footprint";
import type { DiagramPreviewAnnotations } from "../diagram-editor/types";
import { resourceCatalog } from "../resource-settings/catalog";
import { convertArchitectureJsonToDiagramJson } from "./workspace-ai-diagram-adapter";

export type WorkspaceDiagramFixtureViewState = {
  readonly selectedNodeIds?: readonly string[];
  readonly selectedEdgeIds?: readonly string[];
  readonly referenceDropTargetNodeId?: string;
  readonly previewDiagram?: DiagramJson;
  readonly previewAnnotations?: DiagramPreviewAnnotations;
};

export function getWorkspaceDiagramFixture(name: string | undefined): DiagramJson | undefined {
  if (process.env.NODE_ENV === "production" || !name) {
    return undefined;
  }

  return workspaceDiagramFixtureFactories[name]?.();
}

export function getWorkspaceDiagramFixtureViewState(
  name: string | undefined
): WorkspaceDiagramFixtureViewState | undefined {
  if (process.env.NODE_ENV === "production" || !name) {
    return undefined;
  }

  return workspaceDiagramFixtureViewStateFactories[name]?.();
}

const workspaceDiagramFixtureFactories: Readonly<Record<string, () => DiagramJson>> = {
  "area-matrix": createAreaMatrixFixture,
  "automatic-layout-vpc": () => convertArchitectureJsonToDiagramJson(automaticLayoutVpcArchitectureJson),
  conventions: () => convertArchitectureJsonToDiagramJson(conventionArchitectureJson),
  "edge-matrix": createEdgeMatrixFixture,
  "edge-state-matrix": createEdgeStateMatrixFixture,
  "resource-gallery": createResourceGalleryFixture,
  "resource-stress-matrix": createResourceStressMatrixFixture,
  "state-default-matrix": createStateMatrixFixture,
  "state-matrix": createStateMatrixFixture
};

const workspaceDiagramFixtureViewStateFactories: Readonly<
  Record<string, (() => WorkspaceDiagramFixtureViewState) | undefined>
> = {
  "edge-matrix": () => ({
    selectedEdgeIds: ["edge-matrix-1"]
  }),
  "edge-state-matrix": () => ({
    previewDiagram: createEdgeStateMatrixFixture(),
    previewAnnotations: {
      nodeStates: {
        "edge-state-added-target": "added",
        "edge-state-modified-target": "modified",
        "edge-state-deleted-target": "deleted"
      },
      edgeStates: {
        "edge-state-added": "added",
        "edge-state-modified": "modified",
        "edge-state-deleted": "deleted"
      }
    }
  }),
  "state-matrix": () => ({
    selectedNodeIds: ["state-resource-selection-target"],
    referenceDropTargetNodeId: "state-area-reference-target"
  })
};

const RESOURCE_GALLERY_COLUMNS = 8;
const RESOURCE_GALLERY_AREA_COLUMNS = 3;
const RESOURCE_GALLERY_COLUMN_GAP = 32;
const RESOURCE_GALLERY_ROW_GAP = 32;
const RESOURCE_GALLERY_INSET = 40;

function createResourceGalleryFixture(): DiagramJson {
  const catalogNodes = resourceCatalog.map((item) =>
    createCatalogFixtureNode(item, `fixture-resource-${item.id}`)
  );
  const resourceNodes = catalogNodes.filter((node) => !isAreaNode(node));
  const areaNodes = catalogNodes.filter(isAreaNode);
  const resourceVisualBounds = resourceNodes.map((node) => getResourceNodeVisualBounds(node));
  const resourceCellWidth =
    Math.max(...resourceVisualBounds.map((bounds) => bounds.width), 1) +
    RESOURCE_GALLERY_COLUMN_GAP;
  const resourceCellHeight =
    Math.max(...resourceVisualBounds.map((bounds) => bounds.height), 1) +
    RESOURCE_GALLERY_ROW_GAP;
  const resourceRows = Math.ceil(resourceNodes.length / RESOURCE_GALLERY_COLUMNS);
  const areaStartY = RESOURCE_GALLERY_INSET + resourceRows * resourceCellHeight;
  const areaCellWidth =
    Math.max(...areaNodes.map((node) => node.size.width), 1) + RESOURCE_GALLERY_COLUMN_GAP;
  const areaCellHeight =
    Math.max(...areaNodes.map((node) => node.size.height), 1) + RESOURCE_GALLERY_ROW_GAP;
  const positionedResourceNodes = resourceNodes
    .map((node, index) => {
      const visualBounds = getResourceNodeVisualBounds(node);

      return {
        ...node,
        position: {
          x:
            RESOURCE_GALLERY_INSET +
            (index % RESOURCE_GALLERY_COLUMNS) * resourceCellWidth -
            visualBounds.x,
          y:
            RESOURCE_GALLERY_INSET +
            Math.floor(index / RESOURCE_GALLERY_COLUMNS) * resourceCellHeight -
            visualBounds.y
        },
        zIndex: index
      };
    });
  const positionedAreaNodes = areaNodes.map((node, index) => ({
    ...node,
    position: {
      x: RESOURCE_GALLERY_INSET + (index % RESOURCE_GALLERY_AREA_COLUMNS) * areaCellWidth,
      y:
        areaStartY +
        Math.floor(index / RESOURCE_GALLERY_AREA_COLUMNS) * areaCellHeight
    },
    zIndex: positionedResourceNodes.length + index
  }));

  return {
    nodes: [...positionedResourceNodes, ...positionedAreaNodes],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createAreaMatrixFixture(): DiagramJson {
  const nodes = [
    createCatalogFixtureNode(getCatalogItem("aws-region"), "area-region", {
      position: { x: 40, y: 40 },
      size: { width: 1320, height: 700 },
      style: { borderColor: "#5269b3", borderStyle: "solid" },
      zIndex: 0
    }),
    createCatalogFixtureNode(getCatalogItem("aws-availability-zone"), "area-availability-zone", {
      parentAreaNodeId: "area-region",
      position: { x: 80, y: 100 },
      size: { width: 1240, height: 600 },
      style: { borderColor: "#75839a", borderStyle: "dashed" },
      zIndex: 1
    }),
    createCatalogFixtureNode(getCatalogItem("aws-vpc"), "area-vpc", {
      parentAreaNodeId: "area-availability-zone",
      position: { x: 120, y: 160 },
      size: { width: 1160, height: 480 },
      style: { borderColor: "#2f6db3", borderStyle: "solid" },
      zIndex: 2
    }),
    createCatalogFixtureNode(getCatalogItem("aws-subnet"), "area-subnet", {
      parentAreaNodeId: "area-vpc",
      position: { x: 160, y: 220 },
      size: { width: 1080, height: 360 },
      style: { borderColor: "#718096", borderStyle: "dotted" },
      zIndex: 3
    }),
    createCatalogFixtureNode(getCatalogItem("aws-security-group"), "area-security-group", {
      locked: true,
      parentAreaNodeId: "area-subnet",
      position: { x: 200, y: 280 },
      size: { width: 460, height: 300 },
      style: { borderColor: "#287d3c", borderStyle: "solid" },
      zIndex: 4
    }),
    createCatalogFixtureNode(getCatalogItem("aws-autoscaling-group"), "area-autoscaling-group", {
      parentAreaNodeId: "area-subnet",
      position: { x: 920, y: 400 },
      style: { borderColor: "#d97706", borderStyle: "dashed" },
      zIndex: 5
    })
  ];

  return {
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createResourceStressMatrixFixture(): DiagramJson {
  const s3Item = getCatalogItem("aws-s3-bucket");
  const stressNodes = [
    {
      ...createCatalogFixtureNode(getCatalogItem("aws-cloudfront-distribution"), "stress-service-icon"),
      label: "SERVERLESS EVENT ROUTER WITH CROSS ACCOUNT FAILOVER"
    },
    {
      ...createCatalogFixtureNode(getCatalogItem("aws-route-table"), "stress-resource-icon"),
      label: "ULTRALONGUNBROKENRESOURCEIDENTIFIERWITHOUTSPACES",
      size: { width: 28, height: 28 }
    },
    {
      ...createCatalogFixtureNode(getCatalogItem("design-user-client"), "stress-group-icon"),
      iconUrl: "/Architecture-Group-Icons_07312025/Auto-Scaling-group_32.svg",
      label: "GROUP ICON OPTICAL BALANCE"
    },
    {
      ...createCatalogFixtureNode(getCatalogItem("aws-lambda-function"), "stress-fallback-icon"),
      iconUrl: undefined,
      label: "PROVIDER NEUTRAL FALLBACK"
    },
    ...[
      "PRIMARY ARCHIVE WITH SHARED ICON",
      "SECONDARY ARCHIVE WITH SHARED ICON",
      "AUDIT ARCHIVE WITH SHARED ICON",
      "REPLICA ARCHIVE WITH SHARED ICON"
    ].map((label, index) => ({
      ...createCatalogFixtureNode(s3Item, `stress-duplicate-icon-${index + 1}`),
      label
    })),
    ...[
      ["aws-api-gateway-rest-api", "GLOBAL CUSTOMER API AUTHORIZATION GATEWAY"],
      ["aws-rds-read-replica", "CROSS REGION DATABASE READ REPLICA"],
      ["aws-sqs-queue", "EVENT DRIVEN ORDER PROCESSING QUEUE"],
      ["aws-sns-topic", "MULTI ACCOUNT AUDIT NOTIFICATION TOPIC"],
      ["aws-ecs-cluster", "PRIVATE CONTAINER ORCHESTRATION CLUSTER"],
      ["aws-ecs-service", "ZERO DOWNTIME SERVICE DEPLOYMENT TARGET"],
      ["aws-ecs-task-definition", "REGULATED WORKLOAD TASK DEFINITION"],
      ["aws-eks-node-group", "MACHINE LEARNING PLATFORM NODE GROUP"],
      ["aws-cloudwatch-dashboard", "CENTRALIZED OPERATIONS METRICS DASHBOARD"],
      ["aws-lambda-event-source-mapping", "LONG LIVED WORKFLOW EVENT SOURCE MAPPING"],
      ["aws-iam-role-policy-attachment", "SECURITY BOUNDARY ROLE POLICY ATTACHMENT"],
      ["aws-api-gateway-v2-integration", "CUSTOMER IDENTITY WEBSOCKET INTEGRATION"]
    ].map(([catalogId, label], index) => ({
      ...createCatalogFixtureNode(
        getCatalogItem(catalogId ?? ""),
        `stress-long-label-${index + 1}`
      ),
      label: label ?? ""
    }))
  ];

  return {
    nodes: positionFixtureNodesInVisualGrid(stressNodes, 4),
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createEdgeMatrixFixture(): DiagramJson {
  const pathTypes = ["default", "smoothstep", "step", "straight"] as const;
  const lineStyles = ["solid", "dashed", "dotted"] as const;
  const widths = ["thin", "medium", "thick"] as const;
  const combinations = pathTypes.flatMap((pathType) =>
    lineStyles.flatMap((lineStyle) => widths.map((width) => ({ lineStyle, pathType, width })))
  );
  const nodes: DiagramNode[] = [];
  const edges: DiagramJson["edges"] = [];

  for (const [index, combination] of combinations.entries()) {
    const matrixColumn = pathTypes.indexOf(combination.pathType);
    const matrixRow = index % (lineStyles.length * widths.length);
    const sourceNodeId = `edge-source-${index + 1}`;
    const targetNodeId = `edge-target-${index + 1}`;
    const pairX = 40 + matrixColumn * 400;
    const pairY = 40 + matrixRow * 155;

    nodes.push(
      createCatalogFixtureNode(getCatalogItem("aws-s3-bucket"), sourceNodeId, {
        position: { x: pairX, y: pairY },
        zIndex: index * 2
      }),
      createCatalogFixtureNode(getCatalogItem("aws-lambda-function"), targetNodeId, {
        position: { x: pairX + 300, y: pairY + 48 },
        zIndex: index * 2 + 1
      })
    );
    edges.push({
      id: `edge-matrix-${index + 1}`,
      sourceNodeId,
      targetNodeId,
      sourceHandleId: "handle-right",
      targetHandleId: "handle-left",
      label: `${combination.pathType} · ${combination.lineStyle} · ${combination.width}`,
      type: combination.pathType,
      style: {
        animated: false,
        color: "#59687d",
        lineStyle: combination.lineStyle,
        width: combination.width
      }
    });
  }

  return {
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createEdgeStateMatrixFixture(): DiagramJson {
  const nodes: DiagramNode[] = [];
  const edges: DiagramJson["edges"] = [];
  const states = [
    {
      id: "default",
      label: undefined,
      style: { animated: false, color: "#59687d", lineStyle: "solid" as const, width: "thin" as const },
      type: "straight" as const
    },
    {
      id: "added",
      label: "added edge",
      style: { animated: false, color: "#287d3c", lineStyle: "solid" as const, width: "medium" as const },
      type: "smoothstep" as const
    },
    {
      id: "modified",
      label: "modified relationship with a bounded long label",
      style: { animated: false, color: "#9a6700", lineStyle: "dashed" as const, width: "medium" as const },
      type: "step" as const
    },
    {
      id: "deleted",
      label: "deleted edge",
      style: { animated: false, color: "#b42318", lineStyle: "dotted" as const, width: "thick" as const },
      type: "default" as const
    }
  ];

  for (const [index, state] of states.entries()) {
    const sourceNodeId = `edge-state-${state.id}-source`;
    const targetNodeId = `edge-state-${state.id}-target`;
    const y = 60 + index * 150;

    nodes.push(
      createCatalogFixtureNode(getCatalogItem("aws-s3-bucket"), sourceNodeId, {
        position: { x: 80, y },
        zIndex: index * 2
      }),
      createCatalogFixtureNode(getCatalogItem("aws-lambda-function"), targetNodeId, {
        position: { x: 440, y },
        zIndex: index * 2 + 1
      })
    );
    edges.push({
      id: `edge-state-${state.id}`,
      sourceNodeId,
      targetNodeId,
      sourceHandleId: "handle-right",
      targetHandleId: "handle-left",
      ...(state.label ? { label: state.label } : {}),
      type: state.type,
      style: state.style
    });
  }

  return {
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createStateMatrixFixture(): DiagramJson {
  const nodes = [
    createCatalogFixtureNode(getCatalogItem("aws-vpc"), "state-area-reference-target", {
      position: { x: 800, y: 220 },
      size: { width: 520, height: 360 },
      style: { borderColor: "#5269b3", borderStyle: "solid" },
      zIndex: 0
    }),
    createCatalogFixtureNode(getCatalogItem("aws-security-group"), "state-area-locked", {
      locked: true,
      parentAreaNodeId: "state-area-reference-target",
      position: { x: 840, y: 280 },
      size: { width: 440, height: 230 },
      style: { borderColor: "#718096", borderStyle: "dashed" },
      zIndex: 1
    }),
    createCatalogFixtureNode(getCatalogItem("aws-s3-bucket"), "state-resource-default", {
      position: { x: 40, y: 60 },
      zIndex: 10
    }),
    createCatalogFixtureNode(
      getCatalogItem("aws-lambda-function"),
      "state-resource-selection-target",
      {
        position: { x: 320, y: 60 },
        zIndex: 11
      }
    ),
    createCatalogFixtureNode(
      getCatalogItem("aws-cloudwatch-log-group"),
      "state-resource-dimmed-comparison",
      {
        position: { x: 600, y: 60 },
        zIndex: 12
      }
    ),
    createCatalogFixtureNode(getCatalogItem("aws-kms-key"), "state-resource-locked", {
      locked: true,
      position: { x: 880, y: 60 },
      zIndex: 13
    }),
    createCatalogFixtureNode(getCatalogItem("aws-ec2-instance"), "state-reference-source", {
      position: { x: 1160, y: 80 },
      zIndex: 14
    })
  ];

  return {
    nodes,
    edges: [
      {
        id: "state-edge-default",
        sourceNodeId: "state-resource-default",
        targetNodeId: "state-resource-selection-target",
        type: "straight",
        style: { animated: false, color: "#59687d", lineStyle: "solid", width: "thin" }
      },
      {
        id: "state-edge-selection-target",
        sourceNodeId: "state-resource-selection-target",
        targetNodeId: "state-resource-dimmed-comparison",
        label: "Select this edge",
        type: "smoothstep",
        style: { animated: false, color: "#59687d", lineStyle: "dashed", width: "medium" }
      },
      {
        id: "state-edge-explicit-animation",
        sourceNodeId: "state-resource-dimmed-comparison",
        targetNodeId: "state-resource-locked",
        label: "Explicit animation",
        type: "step",
        style: { animated: true, color: "#59687d", lineStyle: "dotted", width: "thick" }
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

type CatalogFixtureNodeOptions = {
  readonly locked?: boolean;
  readonly parentAreaNodeId?: string;
  readonly position?: DiagramNode["position"];
  readonly size?: DiagramNode["size"];
  readonly style?: DiagramNode["style"];
  readonly zIndex?: number;
};

function createCatalogFixtureNode(
  item: ResourceItem,
  id: string,
  options: CatalogFixtureNodeOptions = {}
): DiagramNode {
  const kind =
    item.id.startsWith("design-") || item.nodeDefaults.type.startsWith("sketchcatch_")
      ? "design"
      : "resource";
  const defaultStyle =
    kind === "design"
      ? { textColor: "#243246", borderColor: "#8b98aa" }
      : { textColor: "#172033", borderColor: "#2f6db3" };
  const node: DiagramNode = {
    id,
    type: item.nodeDefaults.type,
    kind,
    position: options.position ? { ...options.position } : { x: 0, y: 0 },
    size: options.size ? { ...options.size } : { ...item.nodeDefaults.size },
    label: item.nodeDefaults.label,
    iconUrl: item.iconUrl,
    locked: options.locked ?? false,
    zIndex: options.zIndex ?? 0,
    style: { ...defaultStyle, ...options.style },
    ...(options.parentAreaNodeId
      ? { metadata: { parentAreaNodeId: options.parentAreaNodeId } }
      : {})
  };

  if (kind === "design") {
    return node;
  }

  return {
    ...node,
    parameters: {
      ...(item.nodeDefaults.terraformBlockType
        ? { terraformBlockType: item.nodeDefaults.terraformBlockType }
        : {}),
      resourceType: item.nodeDefaults.type,
      resourceName: id.replace(/-/gu, "_"),
      fileName: "main",
      values: {}
    }
  };
}

function positionFixtureNodesInVisualGrid(
  nodes: readonly DiagramNode[],
  columns: number
): DiagramNode[] {
  const visualBounds = nodes.map((node) => getResourceNodeVisualBounds(node));
  const cellWidth =
    Math.max(...visualBounds.map((bounds) => bounds.width), 1) + RESOURCE_GALLERY_COLUMN_GAP;
  const cellHeight =
    Math.max(...visualBounds.map((bounds) => bounds.height), 1) + RESOURCE_GALLERY_ROW_GAP;

  return nodes.map((node, index) => {
    const bounds = getResourceNodeVisualBounds(node);

    return {
      ...node,
      position: {
        x: RESOURCE_GALLERY_INSET + (index % columns) * cellWidth - bounds.x,
        y: RESOURCE_GALLERY_INSET + Math.floor(index / columns) * cellHeight - bounds.y
      },
      zIndex: index
    };
  });
}

function getCatalogItem(id: string): ResourceItem {
  const item = resourceCatalog.find((candidate) => candidate.id === id);

  if (!item) {
    throw new Error(`Missing visual fixture catalog item: ${id}`);
  }

  return item;
}

const conventionArchitectureJson: ArchitectureJson = {
  nodes: [
    {
      id: "cdn-public-entry",
      type: "CLOUDFRONT",
      label: "CDN Public Entry",
      positionX: 650,
      positionY: 180,
      config: {}
    },
    {
      id: "web-assets-bucket",
      type: "S3",
      label: "Web Assets Bucket",
      positionX: 980,
      positionY: 200,
      config: { terraformResourceName: "web_assets" }
    },
    {
      id: "api-gateway",
      type: "API_GATEWAY_REST_API",
      label: "API Gateway",
      positionX: 40,
      positionY: 260,
      config: {}
    },
    {
      id: "lambda-invoke-permission",
      type: "LAMBDA_PERMISSION",
      label: "Lambda Permission Invoke",
      positionX: 300,
      positionY: 500,
      config: { action: "lambda:InvokeFunction", principal: "apigateway.amazonaws.com" }
    },
    {
      id: "lambda-execution-role",
      type: "IAM_ROLE",
      label: "Lambda Execution Role",
      positionX: 300,
      positionY: 120,
      config: { assumeRolePolicy: "policy-json" }
    },
    {
      id: "lambda-execution-policy",
      type: "IAM_POLICY",
      label: "Lambda Execution Policy",
      positionX: 1200,
      positionY: 120,
      config: { policy: "policy-json" }
    },
    {
      id: "lambda-function",
      type: "LAMBDA",
      label: "Lambda Function",
      positionX: 1100,
      positionY: 500,
      config: { handler: "index.handler", runtime: "nodejs20.x" }
    },
    {
      id: "upload-bucket",
      type: "S3",
      label: "Upload Bucket",
      positionX: 1420,
      positionY: 400,
      config: {}
    },
    {
      id: "lambda-log-key",
      type: "KMS_KEY",
      label: "Lambda Log Key",
      positionX: 1510,
      positionY: 120,
      config: { enableKeyRotation: true }
    },
    {
      id: "lambda-log-group",
      type: "CLOUDWATCH_LOG_GROUP",
      label: "Lambda Logs",
      positionX: 1740,
      positionY: 300,
      config: { name: "/aws/lambda/practice-function" }
    },
    {
      id: "lambda-error-alarm",
      type: "CLOUDWATCH_METRIC_ALARM",
      label: "Lambda Error Alarm",
      positionX: 840,
      positionY: 500,
      config: { metricName: "Errors", namespace: "AWS/Lambda" }
    }
  ],
  edges: [
    {
      id: "cdn-to-assets",
      sourceId: "cdn-public-entry",
      targetId: "web-assets-bucket",
      label: "HTTPS"
    },
    {
      id: "api-to-permission",
      sourceId: "api-gateway",
      targetId: "lambda-invoke-permission",
      label: "allows invoke"
    },
    {
      id: "permission-to-lambda",
      sourceId: "lambda-invoke-permission",
      targetId: "lambda-function",
      label: "invokes"
    },
    {
      id: "role-to-lambda",
      sourceId: "lambda-execution-role",
      targetId: "lambda-function",
      label: "execution role"
    },
    {
      id: "policy-to-role",
      sourceId: "lambda-execution-policy",
      targetId: "lambda-execution-role",
      label: "grants log access"
    },
    {
      id: "lambda-to-upload",
      sourceId: "lambda-function",
      targetId: "upload-bucket",
      label: "stores files"
    },
    {
      id: "kms-to-logs",
      sourceId: "lambda-log-key",
      targetId: "lambda-log-group",
      label: "encrypts logs"
    },
    {
      id: "lambda-to-logs",
      sourceId: "lambda-function",
      targetId: "lambda-log-group",
      label: "writes logs"
    },
    {
      id: "alarm-to-lambda",
      sourceId: "lambda-error-alarm",
      targetId: "lambda-function",
      label: "monitors errors"
    }
  ]
};

const automaticLayoutVpcArchitectureJson: ArchitectureJson = {
  nodes: [
    { id: "browser", type: "UNKNOWN", label: "Customer Browser", positionX: 2200, positionY: 80, config: { diagramKind: "design", diagramType: "actor_browser", diagramWidth: 160, diagramHeight: 96 } },
    { id: "cloudfront", type: "CLOUDFRONT", label: "CloudFront", positionX: 2100, positionY: 120, config: {} },
    { id: "vpc", type: "VPC", label: "Application VPC", positionX: 80, positionY: 600, config: { cidrBlock: "10.42.0.0/16" } },
    { id: "public-a", type: "SUBNET", label: "Public Subnet A", positionX: 160, positionY: 700, config: {} },
    { id: "public-b", type: "SUBNET", label: "Public Subnet B", positionX: 220, positionY: 760, config: {} },
    { id: "private-a", type: "SUBNET", label: "Private Subnet A", positionX: 280, positionY: 820, config: {} },
    { id: "private-b", type: "SUBNET", label: "Private Subnet B", positionX: 340, positionY: 880, config: {} },
    { id: "database-a", type: "SUBNET", label: "Database Subnet A", positionX: 400, positionY: 940, config: {} },
    { id: "database-b", type: "SUBNET", label: "Database Subnet B", positionX: 460, positionY: 1000, config: {} },
    { id: "load-balancer", type: "LOAD_BALANCER", label: "Application Load Balancer", positionX: 1880, positionY: 1400, config: {} },
    { id: "service-a", type: "ECS_SERVICE", label: "Fargate Service A", positionX: 1900, positionY: 1500, config: { desiredCount: 2, launchType: "FARGATE" } },
    { id: "service-b", type: "ECS_SERVICE", label: "Fargate Service B", positionX: 120, positionY: 1580, config: { desiredCount: 2, launchType: "FARGATE" } },
    { id: "db-primary", type: "RDS", label: "PostgreSQL Primary", positionX: 1740, positionY: 560, config: { engine: "postgres", multiAz: true, publiclyAccessible: false } },
    { id: "db-replica", type: "RDS_READ_REPLICA", label: "PostgreSQL Read Replica", positionX: 120, positionY: 1100, config: { replicateSourceDb: "aws_db_instance.postgresql_primary.identifier" } },
    { id: "pipeline", type: "CODEPIPELINE", label: "Delivery Pipeline", positionX: 2360, positionY: 1700, config: {} },
    { id: "registry", type: "ECR_REPOSITORY", label: "Container Registry", positionX: 1940, positionY: 1760, config: {} },
    { id: "runtime-role", type: "IAM_ROLE", label: "Fargate Runtime Role", positionX: 2280, positionY: 1600, config: {} },
    { id: "logs", type: "CLOUDWATCH_LOG_GROUP", label: "Application Logs", positionX: 80, positionY: 1660, config: {} },
    { id: "alarm", type: "CLOUDWATCH_METRIC_ALARM", label: "Service CPU Alarm", positionX: 1740, positionY: 560, config: { metricName: "CPUUtilization" } }
  ],
  edges: [
    ...["public-a", "public-b", "private-a", "private-b", "database-a", "database-b"].map((targetId) => ({ id: `vpc-contains-${targetId}`, sourceId: "vpc", targetId, label: "contains" })),
    { id: "public-a-contains-alb", sourceId: "public-a", targetId: "load-balancer", label: "contains" },
    { id: "private-a-contains-service", sourceId: "private-a", targetId: "service-a", label: "contains" },
    { id: "private-b-contains-service", sourceId: "private-b", targetId: "service-b", label: "contains" },
    { id: "database-a-contains-primary", sourceId: "database-a", targetId: "db-primary", label: "contains" },
    { id: "database-b-contains-replica", sourceId: "database-b", targetId: "db-replica", label: "contains" },
    { id: "browser-cloudfront", sourceId: "browser", targetId: "cloudfront", label: "HTTPS" },
    { id: "cloudfront-alb", sourceId: "cloudfront", targetId: "load-balancer", label: "API traffic" },
    { id: "alb-service-a", sourceId: "load-balancer", targetId: "service-a", label: "routes requests" },
    { id: "alb-service-b", sourceId: "load-balancer", targetId: "service-b", label: "routes requests" },
    { id: "service-a-db", sourceId: "service-a", targetId: "db-primary", label: "reads/writes" },
    { id: "service-b-db", sourceId: "service-b", targetId: "db-replica", label: "reads" },
    { id: "pipeline-registry", sourceId: "pipeline", targetId: "registry", label: "publishes image" },
    { id: "registry-service-a", sourceId: "registry", targetId: "service-a", label: "deploys image" },
    { id: "registry-service-b", sourceId: "registry", targetId: "service-b", label: "deploys image" },
    { id: "role-service", sourceId: "runtime-role", targetId: "service-a", label: "grants runtime access" },
    { id: "service-logs", sourceId: "service-a", targetId: "logs", label: "writes logs" },
    { id: "alarm-service", sourceId: "alarm", targetId: "service-a", label: "monitors CPU" }
  ]
};

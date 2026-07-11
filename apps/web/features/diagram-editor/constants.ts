import type { DiagramJson, ResourceItem } from "../../../../packages/types/src";
import { RESOURCE_NODE_DEFAULT_SIZE } from "./resource-node-geometry";

export const DEFAULT_DIAGRAM_VIEWPORT = {
  x: 0,
  y: 0,
  zoom: 1
} as const;

export const EMPTY_DIAGRAM: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: DEFAULT_DIAGRAM_VIEWPORT
};

export const RESOURCE_DRAG_MIME_TYPE = "application/vnd.sketchcatch.resource-settings+json";
export const EDGE_LABEL_MIN_ZOOM = 0.75;
export const BOARD_DEFAULT_EDGE_COLOR = "#59687d";

export const NODE_COLOR_SWATCHES = ["#172033", "#1f6feb", "#287d3c", "#b45309", "#b42318"] as const;
export const BORDER_COLOR_SWATCHES = ["#6f4cf6", "#1f6feb", "#2f8c55", "#d76613", "#c9473d"] as const;
export const EDGE_COLOR_SWATCHES = [
  BOARD_DEFAULT_EDGE_COLOR,
  "#1f6feb",
  "#287d3c",
  "#d76613",
  "#b42318"
] as const;

const DEFAULT_CONTAINER_SIZE = {
  width: 360,
  height: 220
} as const;

const groupIconPath = "/Architecture-Group-Icons_07312025";
const serviceIconPath = "/Architecture-Service-Icons_07312025";
const resourceIconPath = "/Resource-Icons_07312025";

export const DEFAULT_PALETTE_ITEMS: readonly ResourceItem[] = [
  {
    id: "aws-vpc",
    name: "VPC",
    cloudProvider: "aws",
    area: "network",
    category: "Network",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-Virtual-Private-Cloud_64.svg`,
    enabled: true,
    nodeDefaults: {
      type: "aws_vpc",
      label: "VPC",
      size: RESOURCE_NODE_DEFAULT_SIZE
    }
  },
  {
    id: "aws-ec2-instance",
    name: "EC2 Instance",
    cloudProvider: "aws",
    area: "compute",
    category: "Compute",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_Amazon-EC2_64.svg`,
    enabled: true,
    nodeDefaults: {
      type: "aws_instance",
      label: "EC2 Instance",
      size: RESOURCE_NODE_DEFAULT_SIZE
    }
  },
  {
    id: "aws-s3-bucket",
    name: "S3 Bucket",
    cloudProvider: "aws",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg`,
    enabled: true,
    nodeDefaults: {
      type: "aws_s3_bucket",
      label: "S3 Bucket",
      size: RESOURCE_NODE_DEFAULT_SIZE
    }
  },
  {
    id: "aws-rds-instance",
    name: "RDS Instance",
    cloudProvider: "aws",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    enabled: true,
    nodeDefaults: {
      type: "aws_db_instance",
      label: "RDS Instance",
      size: RESOURCE_NODE_DEFAULT_SIZE
    }
  },
  {
    id: "design-region",
    name: "Region",
    cloudProvider: "aws",
    area: "containers",
    category: "Design",
    iconUrl: `${groupIconPath}/Region_32.svg`,
    enabled: true,
    nodeDefaults: {
      type: "sketchcatch_region",
      label: "Region",
      size: {
        width: 480,
        height: 320
      }
    }
  },
  {
    id: "design-group",
    name: "Group",
    cloudProvider: "aws",
    area: "containers",
    category: "Design",
    iconUrl: `${groupIconPath}/Auto-Scaling-group_32.svg`,
    enabled: true,
    nodeDefaults: {
      type: "sketchcatch_group",
      label: "Group",
      size: DEFAULT_CONTAINER_SIZE
    }
  }
] as const;

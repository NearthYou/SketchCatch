import type {
  ArchitectureJson,
  DiagramJson,
  DiagramNode,
  TerraformBlockType
} from "@sketchcatch/types";
import {
  getDefaultResourceDefinitionByResourceType,
  getReverseEngineeringAwsProviderResourceVisualFallback,
  type ReverseEngineeringAwsProviderVisualFallbackKey
} from "@sketchcatch/types/resource-definitions";
import { resourceCatalog } from "../resource-settings/catalog";
import { createReverseEngineeringInfrastructureFrames } from "./reverse-engineering-infrastructure-frames";

const FALLBACK_NODE_SIZE = { width: 48, height: 48 } as const;
const RESOURCE_ICON_PATH = "/Resource-Icons_07312025";

type ProviderVisualFallbackPresentation = {
  readonly catalogDefinitionId?: string;
  readonly iconUrl?: string;
};

/** gg: 타입을 Terraform ResourceType으로 바꾸지 않고 기존 팔레트 아이콘만 재사용합니다. */
const PROVIDER_VISUAL_FALLBACK_PRESENTATIONS: Readonly<
  Record<ReverseEngineeringAwsProviderVisualFallbackKey, ProviderVisualFallbackPresentation>
> = {
  athena_data_catalog: {
    iconUrl: `${RESOURCE_ICON_PATH}/Res_Analytics/Res_Amazon-Athena_Data-Source-Connectors_48.svg`
  },
  athena_workgroup: {
    iconUrl: `${RESOURCE_ICON_PATH}/Res_Analytics/Res_Amazon-Athena_Data-Source-Connectors_48.svg`
  },
  cloudformation_stack: {
    iconUrl: `${RESOURCE_ICON_PATH}/Res_Management-Governance/Res_AWS-CloudFormation_Stack_48.svg`
  },
  ec2_dhcp_options: {
    iconUrl: `${RESOURCE_ICON_PATH}/Res_Networking-Content-Delivery/Res_Amazon-VPC_Virtual-private-cloud-VPC_48.svg`
  },
  ec2_network_interface: { catalogDefinitionId: "aws-network-interface" },
  ec2_security_group_rule: { catalogDefinitionId: "aws-security-group-rule" },
  elasticache_user: {
    iconUrl: `${RESOURCE_ICON_PATH}/Res_Database/Res_Amazon-ElastiCache_Cache-Node_48.svg`
  },
  eventbridge_event_bus: {
    iconUrl: `${RESOURCE_ICON_PATH}/Res_Application-Integration/Res_Amazon-EventBridge_Default-Event-Bus_48.svg`
  },
  rds_option_group: { catalogDefinitionId: "aws-db-option-group" },
  rds_parameter_group: { catalogDefinitionId: "aws-db-parameter-group" },
  resource_explorer_index: {
    iconUrl: `${RESOURCE_ICON_PATH}/Res_General-Icons/Res_48_Light/Res_Magnifying-Glass_48_Light.svg`
  },
  resource_explorer_view: {
    iconUrl: `${RESOURCE_ICON_PATH}/Res_General-Icons/Res_48_Light/Res_Magnifying-Glass_48_Light.svg`
  }
};

const GENERIC_AWS_PROVIDER_VISUAL_FALLBACK: ProviderVisualFallbackPresentation & {
  readonly label: string;
} = {
  iconUrl: `${RESOURCE_ICON_PATH}/Res_General-Icons/Res_48_Light/Res_AWS-Management-Console_48_Light.svg`,
  label: "기타 AWS 리소스"
};

/** gg: AWS 원본에 없는 Resource, 설정, 관계를 추론하지 않고 Board 표시 정보만 덧붙입니다. */
export function createSourceExactReverseEngineeringDiagram(
  architecture: ArchitectureJson
): DiagramJson {
  const resourceNodes = architecture.nodes.map(createSourceExactNode);

  return {
    nodes: [
      ...createReverseEngineeringInfrastructureFrames(architecture, resourceNodes),
      ...resourceNodes
    ],
    edges: architecture.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceId,
      targetNodeId: edge.targetId,
      ...(edge.label === undefined ? {} : { label: edge.label })
    })),
    viewport: { x: 0, y: 0, zoom: 1 },
    presentation: {
      geometryPolicy: "source-exact",
      initialViewportPending: true
    }
  };
}

/** gg: Catalog은 아이콘과 카드 크기에만 사용하고 AWS config에는 기본값을 섞지 않습니다. */
function createSourceExactNode(
  node: ArchitectureJson["nodes"][number],
  index: number
): DiagramNode {
  const definition = getDefaultResourceDefinitionByResourceType(node.type);
  const catalogItem = definition
    ? resourceCatalog.find((candidate) => candidate.id === definition.id)
    : undefined;
  const providerResourceType = readNonEmptyString(node.config["providerResourceType"]);
  const providerVisualFallback = providerResourceType
    ? getReverseEngineeringAwsProviderResourceVisualFallback(providerResourceType)
    : undefined;
  const providerVisualPresentation = providerVisualFallback
    ? PROVIDER_VISUAL_FALLBACK_PRESENTATIONS[providerVisualFallback.key]
    : providerResourceType && node.type === "UNKNOWN"
      ? GENERIC_AWS_PROVIDER_VISUAL_FALLBACK
      : undefined;
  const providerCatalogItem = providerVisualPresentation?.catalogDefinitionId
    ? resourceCatalog.find(
        (candidate) => candidate.id === providerVisualPresentation.catalogDefinitionId
      )
    : undefined;
  const displayCatalogItem = catalogItem ?? providerCatalogItem;
  const resourceType = readNonEmptyString(node.config["terraformResourceType"]);
  const resourceName = readNonEmptyString(node.config["terraformResourceName"]);
  const fileName = readNonEmptyString(node.config["terraformFileName"]);
  const terraformBlockType = readTerraformBlockType(node.config["terraformBlockType"]);
  const hasSourceTerraformIdentity = resourceType !== undefined && resourceName !== undefined;

  return {
    id: node.id,
    type: resourceType ?? node.type,
    kind: "resource",
    position: { x: node.positionX, y: node.positionY },
    size: displayCatalogItem
      ? { ...displayCatalogItem.nodeDefaults.size }
      : { ...FALLBACK_NODE_SIZE },
    label:
      node.label ??
      providerVisualFallback?.label ??
      (providerVisualPresentation === GENERIC_AWS_PROVIDER_VISUAL_FALLBACK
        ? GENERIC_AWS_PROVIDER_VISUAL_FALLBACK.label
        : undefined) ??
      displayCatalogItem?.nodeDefaults.label ??
      node.id,
    ...(displayCatalogItem?.iconUrl
      ? { iconUrl: displayCatalogItem.iconUrl }
      : providerVisualPresentation?.iconUrl
        ? { iconUrl: providerVisualPresentation.iconUrl }
        : {}),
    locked: false,
    zIndex: index + 1,
    parameters: {
      ...(terraformBlockType ? { terraformBlockType } : {}),
      resourceType: resourceType ?? "",
      resourceName: resourceName ?? "",
      fileName: fileName ?? "",
      values: structuredClone(node.config),
      ...(!hasSourceTerraformIdentity ? { invalid: true } : {})
    }
  };
}

/** gg: source config에 명시된 Terraform block 종류만 신뢰합니다. */
function readTerraformBlockType(value: unknown): TerraformBlockType | undefined {
  return value === "resource" || value === "data" ? value : undefined;
}

/** gg: 공백뿐인 식별자는 원본 식별자로 취급하지 않습니다. */
function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

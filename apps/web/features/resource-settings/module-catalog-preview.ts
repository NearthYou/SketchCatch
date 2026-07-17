import { resourceCatalog } from "./catalog";
import type { CuratedModuleDefinition } from "./module-catalog";

export type ModuleCatalogPreview = {
  readonly title: string;
  readonly description: string;
  readonly provider: "AWS";
  readonly resourceCount: number;
  readonly relationshipCount: number;
  readonly resourceSummary: string;
};

const userCopyByModuleId: Readonly<Record<string, Pick<ModuleCatalogPreview, "title" | "description">>> = {
  "container-image-delivery": {
    title: "Container Image 준비",
    description: "ECR 저장소와 ECS Task Definition, 실행 권한, 로그 설정을 함께 추가합니다."
  },
  "container-runtime": {
    title: "ECS Container 실행",
    description: "ECS Cluster, Task Definition, Service를 함께 추가합니다."
  },
  "identity-access-boundary": {
    title: "IAM 사용자 권한",
    description: "IAM 사용자와 Group을 만들고 사용자를 Group에 연결합니다."
  },
  "load-balanced-compute": {
    title: "Auto Scaling 웹 서버",
    description: "Classic Load Balancer와 Auto Scaling Group을 함께 추가합니다."
  },
  "network-foundation": {
    title: "VPC 기본 네트워크",
    description: "VPC에 Public·App·DB Subnet과 Internet/NAT 경로를 구성합니다."
  },
  "operations-monitoring": {
    title: "Auto Scaling 모니터링",
    description: "CPU 경보가 Auto Scaling 정책을 실행하도록 연결합니다."
  },
  "relational-data-layer": {
    title: "RDS 데이터베이스",
    description: "RDS와 DB Subnet, Security Group을 함께 추가합니다."
  },
  "secure-object-storage": {
    title: "S3 버전 관리",
    description: "S3 Bucket과 Versioning 설정을 함께 추가합니다."
  },
  "serverless-api": {
    title: "Serverless API",
    description: "API Gateway 요청을 Lambda 함수로 연결합니다."
  },
  "static-web-delivery": {
    title: "Static Web 배포",
    description: "S3의 웹 파일을 CloudFront로 제공하고 공개 접근을 제한합니다."
  }
};

export function createModuleCatalogPreview(
  moduleDefinition: CuratedModuleDefinition
): ModuleCatalogPreview {
  const resources = moduleDefinition.nodes.filter(({ kind }) => kind === "resource");
  const resourceIds = new Set(resources.map(({ id }) => id));
  const copy = userCopyByModuleId[moduleDefinition.id];

  if (!copy) {
    throw new Error(`Missing user-facing Module copy: ${moduleDefinition.id}`);
  }

  return {
    ...copy,
    provider: "AWS",
    resourceCount: resources.length,
    relationshipCount: moduleDefinition.edges.filter(
      ({ sourceNodeId, targetNodeId }) =>
        resourceIds.has(sourceNodeId) && resourceIds.has(targetNodeId)
    ).length,
    resourceSummary: createResourceSummary(resources)
  };
}

function createResourceSummary(
  resources: readonly CuratedModuleDefinition["nodes"][number][]
): string {
  const names = [...new Set(resources.map(getPublicResourceName))];
  const visibleNames = names.slice(0, 3).join(" · ");

  if (names.length <= 3) return visibleNames;
  return `${visibleNames} 외 ${names.length - 3}개`;
}

function getPublicResourceName(
  resource: CuratedModuleDefinition["nodes"][number]
): string {
  const catalogItemId = resource.metadata?.presentationCatalogItemId;
  const catalogItem =
    (catalogItemId ? resourceCatalog.find(({ id }) => id === catalogItemId) : undefined) ??
    resourceCatalog.find(
      (candidate) =>
        (candidate.nodeDefaults.terraformBlockType ?? "resource") ===
          (resource.parameters?.terraformBlockType ?? "resource") &&
        candidate.nodeDefaults.type === (resource.parameters?.resourceType ?? resource.type)
    );

  return catalogItem?.name ?? resource.label;
}

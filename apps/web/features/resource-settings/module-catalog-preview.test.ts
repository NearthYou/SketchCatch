import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { curatedModules } from "./module-catalog";
import { createModuleCatalogPreview } from "./module-catalog-preview";

const moduleCatalogPanelSource = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");

const expectedPreviews = {
  "container-image-delivery": {
    title: "Container Image 준비",
    description: "ECR 저장소와 ECS Task Definition, 실행 권한, 로그 설정을 함께 추가합니다.",
    provider: "AWS",
    resourceCount: 5,
    relationshipCount: 3,
    resourceSummary: "IAM Role · CloudWatch Log Group · ECR Repository 외 1개"
  },
  "container-runtime": {
    title: "ECS Container 실행",
    description: "ECS Cluster, Task Definition, Service를 함께 추가합니다.",
    provider: "AWS",
    resourceCount: 3,
    relationshipCount: 2,
    resourceSummary: "ECS Cluster · ECS Task Definition · ECS Service"
  },
  "identity-access-boundary": {
    title: "IAM 사용자 권한",
    description: "IAM 사용자와 Group을 만들고 사용자를 Group에 연결합니다.",
    provider: "AWS",
    resourceCount: 3,
    relationshipCount: 2,
    resourceSummary: "IAM Group · IAM User · IAM User Group Membership"
  },
  "load-balanced-compute": {
    title: "Auto Scaling 웹 서버",
    description: "Classic Load Balancer와 Auto Scaling Group을 함께 추가합니다.",
    provider: "AWS",
    resourceCount: 3,
    relationshipCount: 1,
    resourceSummary: "Classic Load Balancer · Auto Scaling Group · VPC"
  },
  "network-foundation": {
    title: "VPC 기본 네트워크",
    description: "VPC에 Public·App·DB Subnet과 Internet/NAT 경로를 구성합니다.",
    provider: "AWS",
    resourceCount: 19,
    relationshipCount: 17,
    resourceSummary: "Route Table Association · Route Table · Subnet 외 4개"
  },
  "operations-monitoring": {
    title: "Auto Scaling 모니터링",
    description: "CPU 경보가 Auto Scaling 정책을 실행하도록 연결합니다.",
    provider: "AWS",
    resourceCount: 3,
    relationshipCount: 1,
    resourceSummary: "CloudWatch Metric Alarm · Autoscaling Policy · VPC"
  },
  "relational-data-layer": {
    title: "RDS 데이터베이스",
    description: "RDS와 DB Subnet, Security Group을 함께 추가합니다.",
    provider: "AWS",
    resourceCount: 8,
    relationshipCount: 3,
    resourceSummary: "Security Group · RDS Instance · Subnet 외 2개"
  },
  "secure-object-storage": {
    title: "S3 버전 관리",
    description: "S3 Bucket과 Versioning 설정을 함께 추가합니다.",
    provider: "AWS",
    resourceCount: 2,
    relationshipCount: 1,
    resourceSummary: "S3 Bucket · S3 Bucket Versioning"
  },
  "serverless-api": {
    title: "Serverless API",
    description: "API Gateway 요청을 Lambda 함수로 연결합니다.",
    provider: "AWS",
    resourceCount: 5,
    relationshipCount: 7,
    resourceSummary: "API Gateway Resource · API Gateway Integration · API Gateway Method 외 2개"
  },
  "static-web-delivery": {
    title: "Static Web 배포",
    description: "S3의 웹 파일을 CloudFront로 제공하고 공개 접근을 제한합니다.",
    provider: "AWS",
    resourceCount: 5,
    relationshipCount: 5,
    resourceSummary: "S3 Bucket · S3 Bucket Policy · CloudFront Distribution 외 2개"
  }
} as const;

test("Module 미리보기는 열 개 Module에 승인된 사용자용 문구와 요약만 제공한다", () => {
  assert.deepEqual(
    Object.fromEntries(
      curatedModules.map((moduleDefinition) => [
        moduleDefinition.id,
        createModuleCatalogPreview(moduleDefinition)
      ])
    ),
    expectedPreviews
  );
});

test("Module 미리보기는 public Catalog 이름을 우선하고 세 종류까지만 요약한다", () => {
  const moduleDefinition = findModule("static-web-delivery");
  const [firstResource, ...remainingResources] = moduleDefinition.nodes.filter(
    ({ kind }) => kind === "resource"
  );
  assert.ok(firstResource);

  const preview = createModuleCatalogPreview({
    ...moduleDefinition,
    nodes: [
      {
        ...firstResource,
        metadata: {
          ...firstResource.metadata,
          presentationCatalogItemId: "aws-vpc"
        }
      },
      ...moduleDefinition.nodes.filter(({ kind }) => kind !== "resource"),
      ...remainingResources
    ]
  });

  assert.equal(
    preview.resourceSummary,
    "VPC · S3 Bucket Policy · CloudFront Distribution 외 2개"
  );
});

test("Module 미리보기는 Catalog에 없는 Resource에만 Node label을 사용하고 내부 정보를 노출하지 않는다", () => {
  const moduleDefinition = findModule("static-web-delivery");
  const [firstResource, ...remainingResources] = moduleDefinition.nodes.filter(
    ({ kind }) => kind === "resource"
  );
  assert.ok(firstResource);

  const preview = createModuleCatalogPreview({
    ...moduleDefinition,
    nodes: [
      {
        ...firstResource,
        label: "사용자 정의 Resource",
        type: "custom_resource",
        parameters: {
          ...firstResource.parameters!,
          resourceType: "custom_resource"
        }
      },
      ...moduleDefinition.nodes.filter(({ kind }) => kind !== "resource"),
      ...remainingResources
    ]
  });
  const serializedPreview = JSON.stringify(preview);

  assert.equal(
    preview.resourceSummary,
    "사용자 정의 Resource · S3 Bucket Policy · CloudFront Distribution 외 2개"
  );
  assert.equal(serializedPreview.includes("aws_"), false);
  assert.equal(serializedPreview.includes("architecture-board-knowledge"), false);
});

test("Module 미리보기는 같은 Terraform type의 data Catalog 항목을 구분한다", () => {
  const moduleDefinition = findModule("static-web-delivery");
  const [firstResource, ...remainingResources] = moduleDefinition.nodes.filter(
    ({ kind }) => kind === "resource"
  );
  assert.ok(firstResource);

  const preview = createModuleCatalogPreview({
    ...moduleDefinition,
    nodes: [
      {
        ...firstResource,
        type: "aws_iam_policy",
        parameters: {
          ...firstResource.parameters!,
          terraformBlockType: "data",
          resourceType: "aws_iam_policy"
        }
      },
      ...moduleDefinition.nodes.filter(({ kind }) => kind !== "resource"),
      ...remainingResources
    ]
  });

  assert.equal(
    preview.resourceSummary,
    "IAM Policy Data Source · S3 Bucket Policy · CloudFront Distribution 외 2개"
  );
});

test("Module 카드는 캡처 fallback과 사용자용 요약만 표시한다", () => {
  assert.match(moduleCatalogPanelSource, /<article/);
  assert.match(moduleCatalogPanelSource, /<BoardThumbnailImage/);
  assert.match(
    moduleCatalogPanelSource,
    /import \{ getModuleThumbnailAsset \} from "\.\/module-thumbnail-manifest";/
  );
  assert.match(
    moduleCatalogPanelSource,
    /const asset = getModuleThumbnailAsset\(moduleDefinition\.id\);/
  );
  assert.match(moduleCatalogPanelSource, /src=\{asset\?\.src \?\? null\}/);
  assert.doesNotMatch(moduleCatalogPanelSource, /src=\{null\}/);
  assert.match(moduleCatalogPanelSource, /preview\.title/);
  assert.match(moduleCatalogPanelSource, /preview\.description/);
  assert.match(
    moduleCatalogPanelSource,
    /\{preview\.provider\} · Resource \{preview\.resourceCount\}개 · 연결 \{preview\.relationshipCount\}개/
  );
  assert.match(moduleCatalogPanelSource, /주요 구성/);
  assert.match(moduleCatalogPanelSource, /preview\.resourceSummary/);
  assert.match(moduleCatalogPanelSource, /보드에 추가/);
  assert.doesNotMatch(moduleCatalogPanelSource, /<details/);
  assert.doesNotMatch(moduleCatalogPanelSource, /ModuleCatalogTopology/);
  assert.doesNotMatch(moduleCatalogPanelSource, /preview\.(resources|relationships|inputs|outputs|version|thumbnail)/);
});

function findModule(id: keyof typeof expectedPreviews) {
  const moduleDefinition = curatedModules.find((candidate) => candidate.id === id);
  assert.ok(moduleDefinition, `Missing ${id}`);
  return moduleDefinition;
}

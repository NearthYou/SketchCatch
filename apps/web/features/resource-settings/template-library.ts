import {
  adaptBrainboardTemplateSource,
  brainboardTemplateRegistry,
  isTerraformDeployableNode,
  type DiagramJson,
  type TerraformSyncFileInput
} from "../../../../packages/types/src";
import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";
import {
  findApprovedTemplateReviewDecision,
  resolveApprovedTemplateReviewVariant,
  reviewArchitectureBoardTemplate,
  type ArchitectureBoardCompilationProposal,
  type TemplateReviewDecision
} from "../architecture-board-compiler";
import {
  buildTemplateDiagramJson,
  templateDefinitions,
  type TemplateId
} from "../../../../packages/types/src/template-definitions";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { RESOURCE_NODE_DEFAULT_SIZE } from "../diagram-editor/resource-node-geometry";
import { materializeTemplateDiagram } from "./template-resource-materializer";
import { applyBoardTemplatePresentationCorrections } from "./template-presentation-corrections";
import { getTemplateThumbnailAsset } from "./template-thumbnail-manifest";
import { getBrainboardTemplateThumbnailAsset } from "./brainboard-template-thumbnail-manifest";

export const TEMPLATE_OVERWRITE_BACKUP_STORAGE_KEY = "sketchcatch.templateOverwriteBackups";

type BoardTemplateMetadata = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly thumbnailSrc?: string | undefined;
};

export type AvailableBoardTemplate = BoardTemplateMetadata & {
  readonly availability: "available";
  readonly diagramJson: DiagramJson;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
};

export type UnavailableBoardTemplate = BoardTemplateMetadata & {
  readonly availability: "unavailable";
  readonly unavailableReason: string;
};

export type BoardTemplate = AvailableBoardTemplate | UnavailableBoardTemplate;

export type AvailableBoardTemplateReview = {
  readonly templateId: string;
  readonly sourceDiagram: DiagramJson;
  readonly proposal: ArchitectureBoardCompilationProposal;
};

type RawBoardTemplate = BoardTemplateMetadata & {
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
const TEMPLATE_AREA_DEFAULT_SIZE = { height: 112, width: 112 } as const;
const REPOSITORY_ANALYSIS_TEMPLATE_DEFINITION_IDS = new Map<string, TemplateId>([
  ["template-static-website", "static-web-hosting"],
  ["template-api-db", "three-tier-web-app"],
  ["template-3tier", "three-tier-web-app"]
]);

const LIVE_OBSERVATION_MANAGED_USER_DATA_BASE64 =
  "IyEvYmluL2Jhc2gKIyBza2V0Y2hjYXRjaC1kZW1vLW1hbmFnZWQtdXNlci1kYXRhOnYxCiMgc2tldGNoY2F0Y2gtZGVtby1tYW5hZ2VkLXVzZXItZGF0YS1zaGEyNTY6NTMzYmZhNTUzZDgwN2FlYzdkYzYwOTQxNTg1ZmIxMTU3NzkzYjMxYmY3ZmEwY2FiZTQ2N2MxYmMwMDk5YWQ0NApzZXQgLWV1byBwaXBlZmFpbApkbmYgaW5zdGFsbCAteSBweXRob24zCmNhdCA+L29wdC9za2V0Y2hjYXRjaC1kZW1vLWFwaS5weSA8PCdQWScKZnJvbSBodHRwLnNlcnZlciBpbXBvcnQgQmFzZUhUVFBSZXF1ZXN0SGFuZGxlciwgVGhyZWFkaW5nSFRUUFNlcnZlcgppbXBvcnQganNvbgppbXBvcnQgb3MKaW1wb3J0IHRpbWUKCmNsYXNzIEhhbmRsZXIoQmFzZUhUVFBSZXF1ZXN0SGFuZGxlcik6CiAgICBkZWYgc2VuZF9qc29uKHNlbGYsIHN0YXR1cywgcGF5bG9hZCwgY29ycz1GYWxzZSk6CiAgICAgICAgYm9keSA9IGpzb24uZHVtcHMocGF5bG9hZCkuZW5jb2RlKCJ1dGYtOCIpCiAgICAgICAgc2VsZi5zZW5kX3Jlc3BvbnNlKHN0YXR1cykKICAgICAgICBpZiBjb3JzOgogICAgICAgICAgICBzZWxmLnNlbmRfaGVhZGVyKCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4iLCAiKiIpCiAgICAgICAgICAgIHNlbGYuc2VuZF9oZWFkZXIoIkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMiLCAiQ29udGVudC1UeXBlIikKICAgICAgICAgICAgc2VsZi5zZW5kX2hlYWRlcigiQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyIsICJPUFRJT05TLCBQT1NUIikKICAgICAgICBzZWxmLnNlbmRfaGVhZGVyKCJDb250ZW50LVR5cGUiLCAiYXBwbGljYXRpb24vanNvbiIpCiAgICAgICAgc2VsZi5zZW5kX2hlYWRlcigiQ29udGVudC1MZW5ndGgiLCBzdHIobGVuKGJvZHkpKSkKICAgICAgICBzZWxmLmVuZF9oZWFkZXJzKCkKICAgICAgICBzZWxmLndmaWxlLndyaXRlKGJvZHkpCgogICAgZGVmIGRvX09QVElPTlMoc2VsZik6CiAgICAgICAgaWYgc2VsZi5wYXRoLnN0YXJ0c3dpdGgoIi9hcGkvdHJhZmZpYyIpOgogICAgICAgICAgICBzZWxmLnNlbmRfanNvbigyMDAsIHsib2siOiBUcnVlfSwgY29ycz1UcnVlKQogICAgICAgICAgICByZXR1cm4KICAgICAgICBzZWxmLnNlbmRfcmVzcG9uc2UoNDA0KQogICAgICAgIHNlbGYuZW5kX2hlYWRlcnMoKQoKICAgIGRlZiBkb19HRVQoc2VsZik6CiAgICAgICAgaWYgc2VsZi5wYXRoLnN0YXJ0c3dpdGgoIi9hcGkvaGVhbHRoIik6CiAgICAgICAgICAgIHNlbGYuc2VuZF9qc29uKDIwMCwgewogICAgICAgICAgICAgICAgIm9rIjogVHJ1ZSwKICAgICAgICAgICAgICAgICJpbnN0YW5jZSI6IG9zLnVuYW1lKCkubm9kZW5hbWUsCiAgICAgICAgICAgICAgICAicGF0aCI6IHNlbGYucGF0aCwKICAgICAgICAgICAgICAgICJ0aW1lIjogaW50KHRpbWUudGltZSgpKQogICAgICAgICAgICB9KQogICAgICAgICAgICByZXR1cm4KICAgICAgICBzZWxmLnNlbmRfcmVzcG9uc2UoNDA0KQogICAgICAgIHNlbGYuZW5kX2hlYWRlcnMoKQoKICAgIGRlZiBkb19QT1NUKHNlbGYpOgogICAgICAgIGlmIHNlbGYucGF0aC5zdGFydHN3aXRoKCIvYXBpL3RyYWZmaWMiKToKICAgICAgICAgICAgc2VsZi5zZW5kX2pzb24oMjAwLCB7CiAgICAgICAgICAgICAgICAib2siOiBUcnVlLAogICAgICAgICAgICAgICAgImluc3RhbmNlIjogb3MudW5hbWUoKS5ub2RlbmFtZSwKICAgICAgICAgICAgICAgICJyZWNlaXZlZEF0IjogaW50KHRpbWUudGltZSgpICogMTAwMCkKICAgICAgICAgICAgfSwgY29ycz1UcnVlKQogICAgICAgICAgICByZXR1cm4KICAgICAgICBzZWxmLnNlbmRfcmVzcG9uc2UoNDA0KQogICAgICAgIHNlbGYuZW5kX2hlYWRlcnMoKQoKVGhyZWFkaW5nSFRUUFNlcnZlcigoIjAuMC4wLjAiLCA4MDgwKSwgSGFuZGxlcikuc2VydmVfZm9yZXZlcigpClBZCmNhdCA+L2V0Yy9zeXN0ZW1kL3N5c3RlbS9za2V0Y2hjYXRjaC1kZW1vLWFwaS5zZXJ2aWNlIDw8J1VOSVQnCltVbml0XQpEZXNjcmlwdGlvbj1Ta2V0Y2hDYXRjaCBkZW1vIEFQSQpBZnRlcj1uZXR3b3JrLW9ubGluZS50YXJnZXQKCltTZXJ2aWNlXQpFeGVjU3RhcnQ9L3Vzci9iaW4vcHl0aG9uMyAvb3B0L3NrZXRjaGNhdGNoLWRlbW8tYXBpLnB5ClJlc3RhcnQ9YWx3YXlzClVzZXI9cm9vdAoKW0luc3RhbGxdCldhbnRlZEJ5PW11bHRpLXVzZXIudGFyZ2V0ClVOSVQKc3lzdGVtY3RsIGRhZW1vbi1yZWxvYWQKc3lzdGVtY3RsIGVuYWJsZSAtLW5vdyBza2V0Y2hjYXRjaC1kZW1vLWFwaS5zZXJ2aWNlCg==";

const LIVE_OBSERVATION_AUDIENCE_HTML = [
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/npm/@kfonts/line-seed-sans-kr@0.1.0/index.css">',
  "<title>SketchCatch Service</title><style>body{max-width:680px;margin:0 auto;padding:56px 24px;font:400 22px/1.6 'LINE Seed Sans KR',sans-serif;color:#172033;background:#fafafa}",
  "h1{font-size:38px;font-weight:700}main{padding:32px;border:1px solid #dcdee0;border-radius:16px;background:#fff}</style></head>",
  "<body><main><h1>서비스가 준비되었습니다.</h1><p>공개 요청은 SketchCatch에서 발급한 QR 페이지를 사용해주세요.</p></main></body></html>",
].join("");

const LIVE_OBSERVATION_BUCKET_POLICY = JSON.stringify({
  Statement: [
    {
      Action: "s3:GetObject",
      Effect: "Allow",
      Principal: "*",
      Resource: "${aws_s3_bucket.site.arn}/*",
      Sid: "PublicReadGetObject"
    }
  ],
  Version: "2012-10-17"
});

const legacyBoardTemplates: readonly RawBoardTemplate[] = [
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
  },
  {
    id: "template-live-observation",
    title: "실시간 트래픽 · ASG 관측",
    description:
      "관객 트래픽이 ALB와 ASG 스케일 아웃으로 이어지는 Live Observation 데모 구조입니다.",
    tags: ["Live Observation", "ALB", "ASG", "CloudWatch"],
    diagramJson: {
      nodes: [
        createTerraformTemplateNode({
          id: "template-live-vpc",
          label: "Demo VPC",
          position: { x: 60, y: 160 },
          resourceName: "demo",
          type: "aws_vpc",
          values: {
            cidrBlock: "10.42.0.0/16",
            enableDnsHostnames: true,
            enableDnsSupport: true,
            tags: { SketchCatchDemo: "true" }
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-igw",
          label: "Internet Gateway",
          position: { x: 220, y: 40 },
          resourceName: "demo",
          type: "aws_internet_gateway",
          values: { vpcId: "aws_vpc.demo.id" }
        }),
        createTerraformTemplateNode({
          id: "template-live-subnet-a",
          label: "Public Subnet A",
          position: { x: 220, y: 160 },
          resourceName: "public_a",
          type: "aws_subnet",
          values: {
            availabilityZone: "ap-northeast-2a",
            cidrBlock: "10.42.1.0/24",
            mapPublicIpOnLaunch: true,
            vpcId: "aws_vpc.demo.id"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-subnet-c",
          label: "Public Subnet C",
          position: { x: 220, y: 280 },
          resourceName: "public_c",
          type: "aws_subnet",
          values: {
            availabilityZone: "ap-northeast-2c",
            cidrBlock: "10.42.2.0/24",
            mapPublicIpOnLaunch: true,
            vpcId: "aws_vpc.demo.id"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-route-table",
          label: "Public Route Table",
          position: { x: 390, y: 40 },
          resourceName: "public",
          type: "aws_route_table",
          values: {
            route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "aws_internet_gateway.demo.id" }],
            vpcId: "aws_vpc.demo.id"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-route-a",
          label: "Route Association A",
          position: { x: 390, y: 160 },
          resourceName: "public_a",
          type: "aws_route_table_association",
          values: {
            routeTableId: "aws_route_table.public.id",
            subnetId: "aws_subnet.public_a.id"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-route-c",
          label: "Route Association C",
          position: { x: 390, y: 280 },
          resourceName: "public_c",
          type: "aws_route_table_association",
          values: {
            routeTableId: "aws_route_table.public.id",
            subnetId: "aws_subnet.public_c.id"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-alb-sg",
          label: "ALB Security Group",
          position: { x: 550, y: 120 },
          resourceName: "alb",
          type: "aws_security_group",
          values: {
            egress: [{ cidrBlocks: ["0.0.0.0/0"], fromPort: 0, protocol: "-1", toPort: 0 }],
            ingress: [{ cidrBlocks: ["0.0.0.0/0"], fromPort: 80, protocol: "tcp", toPort: 80 }],
            namePrefix: "sc-lo-alb-",
            vpcId: "aws_vpc.demo.id"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-api-sg",
          label: "API Security Group",
          position: { x: 720, y: 120 },
          resourceName: "api",
          type: "aws_security_group",
          values: {
            egress: [{ cidrBlocks: ["0.0.0.0/0"], fromPort: 0, protocol: "-1", toPort: 0 }],
            ingress: [
              {
                fromPort: 8080,
                protocol: "tcp",
                securityGroups: ["aws_security_group.alb.id"],
                toPort: 8080
              }
            ],
            namePrefix: "sc-lo-api-",
            vpcId: "aws_vpc.demo.id"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-site",
          label: "Audience Site",
          position: { x: 60, y: 480 },
          resourceName: "site",
          type: "aws_s3_bucket",
          values: {
            bucketPrefix: "sketchcatch-live-observation-",
            forceDestroy: true,
            tags: { SketchCatchDemo: "true" }
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-site-access",
          label: "S3 Public Access",
          position: { x: 220, y: 480 },
          resourceName: "site",
          type: "aws_s3_bucket_public_access_block",
          values: {
            blockPublicAcls: true,
            blockPublicPolicy: false,
            bucket: "aws_s3_bucket.site.id",
            ignorePublicAcls: true,
            restrictPublicBuckets: false
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-site-config",
          label: "S3 Website",
          position: { x: 380, y: 480 },
          resourceName: "site",
          type: "aws_s3_bucket_website_configuration",
          values: {
            bucket: "aws_s3_bucket.site.id",
            indexDocument: { suffix: "index.html" }
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-site-policy",
          label: "Audience Read Policy",
          position: { x: 540, y: 480 },
          resourceName: "site",
          type: "aws_s3_bucket_policy",
          values: {
            bucket: "aws_s3_bucket.site.id",
            dependsOn: ["aws_s3_bucket_public_access_block.site"],
            policy: LIVE_OBSERVATION_BUCKET_POLICY
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-site-index",
          label: "Audience index.html",
          position: { x: 700, y: 480 },
          resourceName: "index",
          type: "aws_s3_object",
          values: {
            bucket: "aws_s3_bucket.site.id",
            content: LIVE_OBSERVATION_AUDIENCE_HTML,
            contentType: "text/html; charset=utf-8",
            key: "index.html"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-ami",
          label: "Amazon Linux 2023",
          position: { x: 900, y: 40 },
          resourceName: "al2023",
          terraformBlockType: "data",
          type: "aws_ami",
          values: {
            filter: [{ name: "name", values: ["al2023-ami-*-x86_64"] }],
            mostRecent: true,
            owners: ["amazon"]
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-log-group",
          label: "CloudWatch Agent Logs",
          position: { x: 1060, y: 40 },
          resourceName: "traffic",
          type: "aws_cloudwatch_log_group",
          values: {
            name: "/sketchcatch/demo/sc-lo/traffic",
            retentionInDays: 1,
            tags: { SketchCatchDemo: "true" }
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-agent-role",
          label: "EC2 Agent IAM Role",
          position: { x: 1060, y: 140 },
          resourceName: "api_agent",
          type: "aws_iam_role",
          values: {
            assumeRolePolicy: JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: { Service: "ec2.amazonaws.com" },
                  Action: "sts:AssumeRole"
                }
              ]
            }),
            namePrefix: "sc-lo-api-agent-",
            tags: { SketchCatchDemo: "true" }
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-agent-policy",
          label: "CloudWatch Agent Policy",
          position: { x: 1240, y: 140 },
          resourceName: "cloudwatch_agent",
          type: "aws_iam_role_policy_attachment",
          values: {
            policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
            role: "aws_iam_role.api_agent.name"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-agent-profile",
          label: "Instance Profile",
          position: { x: 1240, y: 240 },
          resourceName: "api_agent",
          type: "aws_iam_instance_profile",
          values: {
            namePrefix: "sc-lo-api-agent-",
            role: "aws_iam_role.api_agent.name"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-alb",
          label: "Application Load Balancer",
          position: { x: 620, y: 280 },
          resourceName: "demo",
          type: "aws_lb",
          values: {
            dropInvalidHeaderFields: true,
            loadBalancerType: "application",
            namePrefix: "sc-lo-",
            securityGroups: ["aws_security_group.alb.id"],
            subnets: ["aws_subnet.public_a.id", "aws_subnet.public_c.id"]
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-target-group",
          label: "Traffic Target Group",
          position: { x: 800, y: 280 },
          resourceName: "api",
          type: "aws_lb_target_group",
          values: {
            healthCheck: {
              healthyThreshold: 2,
              interval: 15,
              matcher: "200",
              path: "/api/health",
              unhealthyThreshold: 2
            },
            namePrefix: "sc-lo-",
            port: 8080,
            protocol: "HTTP",
            vpcId: "aws_vpc.demo.id"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-listener",
          label: "HTTP Listener",
          position: { x: 710, y: 380 },
          resourceName: "http",
          type: "aws_lb_listener",
          values: {
            defaultAction: {
              targetGroupArn: "aws_lb_target_group.api.arn",
              type: "forward"
            },
            loadBalancerArn: "aws_lb.demo.arn",
            port: 80,
            protocol: "HTTP"
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-launch-template",
          label: "Traffic API Launch Template",
          position: { x: 900, y: 140 },
          resourceName: "api",
          type: "aws_launch_template",
          values: {
            imageId: "data.aws_ami.al2023.id",
            instanceType: "t3.micro",
            iamInstanceProfile: { name: "aws_iam_instance_profile.api_agent.name" },
            metadataOptions: { httpEndpoint: "enabled", httpTokens: "required" },
            namePrefix: "sc-lo-api-",
            tagSpecifications: {
              resourceType: "instance",
              tags: { Name: "sketchcatch-live-observation", SketchCatchDemo: "true" }
            },
            userData: LIVE_OBSERVATION_MANAGED_USER_DATA_BASE64,
            vpcSecurityGroupIds: ["aws_security_group.api.id"]
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-asg",
          label: "Auto Scaling Group 1–2",
          position: { x: 980, y: 280 },
          resourceName: "api",
          type: "aws_autoscaling_group",
          values: {
            defaultInstanceWarmup: 60,
            desiredCapacity: 1,
            healthCheckGracePeriod: 120,
            healthCheckType: "ELB",
            launchTemplate: { id: "aws_launch_template.api.id", version: "$Latest" },
            maxSize: 2,
            minSize: 1,
            namePrefix: "sc-lo-asg-",
            targetGroupArns: ["aws_lb_target_group.api.arn"],
            vpcZoneIdentifier: ["aws_subnet.public_a.id", "aws_subnet.public_c.id"]
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-policy",
          label: "Scale-out +1",
          position: { x: 1160, y: 220 },
          resourceName: "scale_out",
          type: "aws_autoscaling_policy",
          values: {
            adjustmentType: "ChangeInCapacity",
            autoscalingGroupName: "aws_autoscaling_group.api.name",
            cooldown: 180,
            estimatedInstanceWarmup: 60,
            name: "sketchcatch-live-observation-scale-out",
            policyType: "StepScaling",
            stepAdjustment: [{ metricIntervalLowerBound: 0, scalingAdjustment: 1 }]
          }
        }),
        createTerraformTemplateNode({
          id: "template-live-alarm",
          label: "60 requests / minute",
          position: { x: 1160, y: 360 },
          resourceName: "scale_out",
          type: "aws_cloudwatch_metric_alarm",
          values: {
            alarmActions: ["aws_autoscaling_policy.scale_out.arn"],
            alarmName: "${aws_autoscaling_group.api.name}-scale-out",
            comparisonOperator: "GreaterThanOrEqualToThreshold",
            datapointsToAlarm: 1,
            dimensions: {
              LoadBalancer: "aws_lb.demo.arn_suffix",
              TargetGroup: "aws_lb_target_group.api.arn_suffix"
            },
            evaluationPeriods: 1,
            metricName: "RequestCountPerTarget",
            namespace: "AWS/ApplicationELB",
            period: 60,
            statistic: "Sum",
            threshold: 60,
            treatMissingData: "notBreaching"
          }
        })
      ],
      edges: [
        createTemplateEdge(
          "template-live-site-flow",
          "template-live-site-config",
          "template-live-alb",
          "audience traffic"
        ),
        createTemplateEdge(
          "template-live-alb-target",
          "template-live-alb",
          "template-live-target-group",
          "routes"
        ),
        createTemplateEdge(
          "template-live-target-asg",
          "template-live-target-group",
          "template-live-asg",
          "targets"
        ),
        createTemplateEdge(
          "template-live-role-policy",
          "template-live-agent-role",
          "template-live-agent-policy",
          "grants"
        ),
        createTemplateEdge(
          "template-live-role-profile",
          "template-live-agent-role",
          "template-live-agent-profile",
          "assumes"
        ),
        createTemplateEdge(
          "template-live-profile-launch",
          "template-live-agent-profile",
          "template-live-launch-template",
          "profile"
        ),
        createTemplateEdge(
          "template-live-agent-logs",
          "template-live-launch-template",
          "template-live-log-group",
          "agent metrics"
        ),
        createTemplateEdge(
          "template-live-launch-asg",
          "template-live-launch-template",
          "template-live-asg",
          "launches"
        ),
        createTemplateEdge(
          "template-live-alarm-policy",
          "template-live-alarm",
          "template-live-policy",
          "triggers"
        ),
        createTemplateEdge(
          "template-live-policy-asg",
          "template-live-policy",
          "template-live-asg",
          "+1 instance"
        )
      ],
      viewport: { x: 0, y: 0, zoom: 0.62 }
    }
  }
];

const repositoryBoardTemplates: readonly AvailableBoardTemplate[] = templateDefinitions.map(
  (definition) => ({
    availability: "available",
    id: definition.id,
    title: definition.title,
    description: definition.description,
    tags: definition.tags,
    thumbnailSrc: getTemplateThumbnailAsset(definition.id).src,
    terraformFiles: [],
    diagramJson: buildTemplateDiagramJson(definition.id, {
      projectSlug: "sketchcatch",
      shortId: definition.id
    })
  })
);

const brainboardBoardTemplates: readonly AvailableBoardTemplate[] = brainboardTemplateRegistry
  .filter((entry): entry is Extract<(typeof brainboardTemplateRegistry)[number], { status: "available" }> =>
    entry.status === "available"
  )
  .map((entry) => {
    const evidence = entry.source;
    const descriptions: Readonly<Record<string, string>> = {
      "AWS onboarding": "AWS에서 EKS 클러스터와 노드 그룹, 네이티브 VPC CNI 네트워크를 구성합니다. 클러스터와 노드 그룹에 필요한 IAM 역할을 포함하며, 인터넷 게이트웨이를 통해 서브넷으로 트래픽을 전달합니다.",
      "AWS Kubernetes cluster with native CNIs": "AWS에서 EKS 클러스터와 노드 그룹, 네이티브 VPC CNI 네트워크를 구성합니다. 클러스터와 노드 그룹에 필요한 IAM 역할을 포함하며, 인터넷 게이트웨이를 통해 서브넷으로 트래픽을 전달합니다.",
      "AWS VPC with subnet and security groups on 2 AZs": "여러 서비스와 인스턴스, 데이터베이스를 호스팅할 수 있는 기본 네트워크 구성입니다. 하나의 리전에 있는 두 가용 영역과 VPC, 서브넷, 보안 그룹으로 구성하며 필요에 따라 가용 영역을 추가할 수 있습니다.",
      "AWS serverless architecture with CDN": "S3와 API Gateway, CloudFront를 사용해 정적 콘텐츠를 제공하는 서버리스 아키텍처입니다.",
      "AWS EC2 instance inside VPC & Subnet": "VPC와 서브넷 내부에 EC2 인스턴스를 배치하는 기본 구성입니다.",
      "AWS ASG and LB with VPC & subnets": "VPC와 서브넷 위에 로드 밸런서와 오토 스케일링 그룹을 구성해 애플리케이션 트래픽을 분산하고 인스턴스 수를 자동 조정합니다.",
      "AWS Jenkins architecture on EC2": "EC2에서 Jenkins를 실행하고 네트워크와 보안 그룹을 함께 구성하는 CI/CD 시작 구조입니다.",
      "AWS REST API for DocumentDB": "API Gateway와 Lambda를 통해 DocumentDB 데이터에 접근하는 REST API 구조입니다.",
      "AWS network landing zone": "여러 AWS 계정과 네트워크를 확장하기 위한 기본 랜딩 존 구조입니다.",
      "AWS 3-tier web app with a database": "DNS 영역, 방화벽, 로드 밸런서와 데이터베이스를 포함한 3계층 웹 애플리케이션 구조입니다. 필요에 따라 라우트와 라우트 테이블 연결을 추가할 수 있습니다.",
      "AWS Bastion": "프라이빗 네트워크의 인스턴스에 안전하게 접속하기 위한 Bastion 호스트 구성입니다.",
      "AWS instance and DB with multiple networks": "여러 네트워크에 걸쳐 애플리케이션 인스턴스와 데이터베이스를 배치하는 구조입니다.",
      "AWS load balancer with target group": "로드 밸런서와 대상 그룹을 연결해 애플리케이션 트래픽을 대상 인스턴스로 전달합니다.",
      "AWS S3 API Gateway integration": "API Gateway와 S3를 연결해 객체를 API로 제공하는 서버리스 구조입니다.",
      "AWS costs monitoring": "AWS 비용과 사용량을 추적하기 위한 예산 및 모니터링 구성입니다.",
      "AWS ECS with Fargate": "서버를 직접 관리하지 않고 ECS Fargate에서 컨테이너 워크로드를 실행합니다.",
      "AWS multi-account management": "여러 AWS 계정을 중앙에서 관리하기 위한 조직 및 계정 구성입니다.",
      "AWS Elastic Beanstalk": "Elastic Beanstalk 애플리케이션과 환경을 구성해 애플리케이션 배포를 단순화합니다.",
      "AWS RDS": "관리형 RDS 데이터베이스 인스턴스와 네트워크 구성을 시작합니다.",
      "AWS FSX architecture": "FSx for Lustre 파일 시스템을 생성하고 네트워크에 연결합니다.",
      "Cross account AWS S3": "서로 다른 AWS 계정 간에 S3 버킷을 공유하고 접근하도록 구성합니다.",
      "AWS IAM users creation": "IAM 사용자와 그룹, 정책 연결 및 로그인 프로필을 구성합니다.",
      "AWS Dashcam Video Processing Pipeline": "대시캠 영상 수집과 저장, 처리를 위한 AWS 서비스 구성을 시작합니다.",
      "AWS secure S3 bucket": "퍼블릭 접근을 차단하고 암호화와 버전 관리를 적용한 보안 S3 버킷 구성입니다."
    };
    const metadata = {
      description: descriptions[evidence.title] ?? "AWS 리소스를 조합한 인프라 구성 템플릿입니다.",
      id: entry.id,
      tags: ["AWS"],
      thumbnailSrc: getBrainboardTemplateThumbnailAsset(entry.id).src,
      title: evidence.title
    } as const;

    const adapted = adaptBrainboardTemplateSource(entry.source);
    return {
      ...metadata,
      availability: "available",
      diagramJson: adapted.diagramJson,
      terraformFiles: adapted.terraformFiles
    };
  });

const boardTemplates: readonly BoardTemplate[] = [
  ...repositoryBoardTemplates,
  ...brainboardBoardTemplates
];

// 페이지와 보드 모달은 실제 Board 캡처로 검토한 authored geometry를 같은 목록에서 사용한다.
export function listBoardTemplates(): readonly BoardTemplate[] {
  return boardTemplates.map(cloneBoardTemplate);
}

// 여섯 개 SketchCatch authored Template만 검증하는 기존 배포·레이아웃 계약용 목록입니다.
export function listRepositoryBoardTemplates(): readonly AvailableBoardTemplate[] {
  return repositoryBoardTemplates.map(cloneAvailableBoardTemplate);
}

export function isBoardTemplateAvailable(
  template: BoardTemplate
): template is AvailableBoardTemplate {
  return template.availability === "available";
}

// Template 내용과 설명·태그·Terraform seed를 함께 fingerprint해 선택 상태의 revision으로 사용합니다.
export function getBoardTemplateVersion(template: AvailableBoardTemplate): string {
  return `v-${createTemplateVersionHash(
    JSON.stringify({
      description: template.description,
      diagramJson: template.diagramJson,
      id: template.id,
      tags: template.tags,
      terraformFiles: template.terraformFiles,
      title: template.title
    })
  )}`;
}

export function reviewAvailableBoardTemplate(
  template: AvailableBoardTemplate
): AvailableBoardTemplateReview {
  // Authoring source를 기준으로 proposal을 만들고, 승인된 visual-only variant만 별도 registry에서 소비합니다.
  const sourceDiagram = cloneDiagramJson(template.diagramJson);

  return {
    templateId: template.id,
    sourceDiagram,
    proposal: reviewArchitectureBoardTemplate(sourceDiagram)
  };
}

// Resource kind와 Terraform parameters가 모두 있는 실제 배포 Resource만 셉니다.
export function getBoardTemplateResourceCount(template: BoardTemplate): number {
  if (!isBoardTemplateAvailable(template)) return 0;
  return template.diagramJson.nodes.filter(isTerraformDeployableNode).length;
}

// 양쪽 끝이 배포 Resource인 semantic relationship만 Gallery 숫자에 포함합니다.
export function getBoardTemplateRelationshipCount(template: BoardTemplate): number {
  if (!isBoardTemplateAvailable(template)) return 0;
  const deployableNodeIds = new Set(
    template.diagramJson.nodes.filter(isTerraformDeployableNode).map((node) => node.id)
  );

  return template.diagramJson.edges.filter(
    (edge) => deployableNodeIds.has(edge.sourceNodeId) && deployableNodeIds.has(edge.targetNodeId)
  ).length;
}

// Live Observation과 기존 저장 Draft 검증은 배포 Template 카탈로그와 분리된 레거시 fixture를 사용합니다.
export function listLegacyBoardTemplates(): readonly AvailableBoardTemplate[] {
  return legacyBoardTemplates.map((template) => ({
    ...template,
    availability: "available",
    diagramJson: materializeTemplateDiagram(cloneDiagramJson(template.diagramJson)),
    terraformFiles: []
  }));
}

export function buildBoardTemplateDiagram(
  templateId: string | undefined,
  input: { readonly projectSlug: string; readonly shortId: string }
): DiagramJson | undefined {
  // New Boards must retain the reviewed layout instead of re-running the generic topology arranger.
  const definitionId = resolveTemplateDefinitionId(templateId);
  const definition = templateDefinitions.find((candidate) => candidate.id === definitionId);
  if (definition) {
    return materializeBoardTemplateDiagram(
      definition.id,
      resolveApprovedBoardTemplateDiagram(
        definition.id,
        buildTemplateDiagramJson(definition.id, input)
      )
    );
  }

  const brainboardTemplate = brainboardBoardTemplates.find(
    (candidate): candidate is AvailableBoardTemplate =>
      candidate.id === templateId && candidate.availability === "available"
  );
  return brainboardTemplate
    ? materializeBoardTemplateDiagram(
        brainboardTemplate.id,
        resolveApprovedBoardTemplateDiagram(
          brainboardTemplate.id,
          cloneDiagramJson(brainboardTemplate.diagramJson)
        )
      )
    : undefined;
}

/**
 * One gallery/start seam for approved compiled variants. No registry entry, stale source, or
 * semantic approval always falls back to the authored source diagram.
 */
export function resolveApprovedBoardTemplateDiagram(
  templateId: string,
  sourceDiagram: DiagramJson,
  decision: TemplateReviewDecision | undefined = findApprovedTemplateReviewDecision(templateId)
): DiagramJson {
  return resolveApprovedTemplateReviewVariant(
    { id: templateId, diagramJson: sourceDiagram },
    decision
  ).diagram;
}

function resolveTemplateDefinitionId(templateId: string | undefined): TemplateId | undefined {
  if (!templateId) {
    return undefined;
  }

  return (
    REPOSITORY_ANALYSIS_TEMPLATE_DEFINITION_IDS.get(templateId) ??
    templateDefinitions.find((candidate) => candidate.id === templateId)?.id
  );
}

// Template 목록에서 이름·설명·태그와 보드에 포함된 Resource identity를 검색합니다.
export function filterBoardTemplates(
  templates: readonly BoardTemplate[],
  filter: BoardTemplateFilter
): readonly BoardTemplate[] {
  const query = filter.query.trim().toLocaleLowerCase("ko-KR");
  const filteredTemplates = templates.filter((template) => {
    const matchesTag = filter.tag === "all" || template.tags.includes(filter.tag);
    const searchableText = [
      template.title,
      template.description,
      ...template.tags,
      ...getBoardTemplateResourceSearchTerms(template)
    ]
      .join(" ")
      .toLocaleLowerCase("ko-KR");

    return matchesTag && (query.length === 0 || searchableText.includes(query));
  });

  if (filter.sort === "name") {
    return [...filteredTemplates].sort((left, right) =>
      left.title.localeCompare(right.title, "ko-KR")
    );
  }

  if (filter.sort === "resources") {
    return [...filteredTemplates].sort(
      (left, right) => getBoardTemplateResourceCount(right) - getBoardTemplateResourceCount(left)
    );
  }

  return filteredTemplates;
}

function getBoardTemplateResourceSearchTerms(template: BoardTemplate): readonly string[] {
  if (!isBoardTemplateAvailable(template)) return [];

  return template.diagramJson.nodes.flatMap((node) => {
    const parameters = node.parameters;
    const resourceDefinition = parameters
      ? getResourceDefinitionByTerraform(
          parameters.terraformBlockType ?? "resource",
          parameters.resourceType
        )
      : undefined;

    return [
      node.label,
      node.type,
      parameters?.resourceType,
      parameters?.resourceName,
      resourceDefinition?.id,
      resourceDefinition?.resourceType
    ].filter((term): term is string => Boolean(term));
  });
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
  readonly template: AvailableBoardTemplate;
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

function cloneBoardTemplate(template: BoardTemplate): BoardTemplate {
  if (!isBoardTemplateAvailable(template)) {
    return { ...template, tags: [...template.tags] };
  }

  return cloneAvailableBoardTemplate(template);
}

function cloneAvailableBoardTemplate(template: AvailableBoardTemplate): AvailableBoardTemplate {
  return {
    ...template,
    diagramJson: materializeBoardTemplateDiagram(
      template.id,
      resolveApprovedBoardTemplateDiagram(template.id, cloneDiagramJson(template.diagramJson))
    ),
    tags: [...template.tags],
    terraformFiles: template.terraformFiles.map((file) => ({ ...file }))
  };
}

function createTemplateVersionHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function materializeBoardTemplateDiagram(templateId: string, diagram: DiagramJson): DiagramJson {
  return applyBoardTemplatePresentationCorrections(
    templateId,
    materializeTemplateDiagram(diagram, "authored")
  );
}

// localStorage에 저장된 템플릿 덮어쓰기 백업을 읽습니다.
export function readTemplateOverwriteBackups(
  storage: TemplateStorage
): readonly TemplateOverwriteBackup[] {
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
  parameters,
  position,
  size,
  type,
  zIndex = 1
}: {
  readonly id: string;
  readonly kind?: "resource" | "design" | undefined;
  readonly label: string;
  readonly metadata?: { readonly parentAreaNodeId?: string | undefined } | undefined;
  readonly parameters?: DiagramJson["nodes"][number]["parameters"] | undefined;
  readonly position: { readonly x: number; readonly y: number };
  readonly size?: { readonly height: number; readonly width: number } | undefined;
  readonly type: string;
  readonly zIndex?: number | undefined;
}): DiagramJson["nodes"][number] {
  const node: DiagramJson["nodes"][number] = {
    id,
    kind,
    label,
    locked: false,
    metadata,
    parameters,
    position,
    size: size ?? RESOURCE_NODE_DEFAULT_SIZE,
    type,
    zIndex
  };

  if (size || !isAreaNode(node)) {
    return node;
  }

  return { ...node, size: TEMPLATE_AREA_DEFAULT_SIZE };
}

function createTerraformTemplateNode({
  id,
  label,
  position,
  resourceName,
  terraformBlockType = "resource",
  type,
  values = {}
}: {
  readonly id: string;
  readonly label: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly resourceName: string;
  readonly terraformBlockType?: "data" | "resource" | undefined;
  readonly type: string;
  readonly values?: Record<string, unknown> | undefined;
}): DiagramJson["nodes"][number] {
  return createTemplateNode({
    id,
    label,
    parameters: {
      fileName: "main",
      resourceName,
      resourceType: type,
      terraformBlockType,
      values
    },
    position,
    type
  });
}

function createTemplateEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  label: string
): DiagramJson["edges"][number] {
  return { id, label, sourceNodeId, targetNodeId, type: "smoothstep" };
}

// Optional node fields stay absent while nested mutable values receive independent copies.
function cloneDiagramJson(diagramJson: DiagramJson): DiagramJson {
  return {
    ...diagramJson,
    edges: diagramJson.edges.map((edge) => ({
      ...edge,
      style: edge.style ? { ...edge.style } : undefined
    })),
    nodes: diagramJson.nodes.map((node) => ({
      ...node,
      metadata: node.metadata ? { ...node.metadata } : undefined,
      ...(node.parameters ? { parameters: { ...node.parameters } } : {}),
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
  return (
    Array.isArray(candidate.nodes) && Array.isArray(candidate.edges) && Boolean(candidate.viewport)
  );
}

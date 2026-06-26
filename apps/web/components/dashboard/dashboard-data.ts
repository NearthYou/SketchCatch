export type CloudService = "AWS" | "GCP" | "Kubernetes" | "Azure";

export type ProjectSummary = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cloudServices: readonly CloudService[];
  readonly resources: readonly string[];
  readonly lastOpenedLabel: string;
  readonly lastDeployedLabel: string | null;
  readonly updatedLabel: string;
  readonly deploymentStatus: "running" | "stopped" | "failed" | "not_deployed";
  readonly monthlyCostUsd: number;
};

export type MarketplaceTemplate = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly ownerName: string;
  readonly cloudServices: readonly CloudService[];
  readonly priceUsd: number;
  readonly likeCount: number;
  readonly liked: boolean;
  readonly purchased: boolean;
};

export type OwnedTemplate = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cloudServices: readonly CloudService[];
  readonly updatedLabel: string;
};

export const cloudServiceOptions: readonly CloudService[] = ["AWS", "GCP", "Kubernetes", "Azure"];

export const projects: readonly ProjectSummary[] = [
  {
    cloudServices: ["AWS"],
    deploymentStatus: "running",
    description: "VPC, public subnet, EC2를 둔 기본 웹 서버 설계",
    id: "project-vpc-web",
    lastDeployedLabel: "1시간 전 배포",
    lastOpenedLabel: "4시간 전 최종 수정",
    monthlyCostUsd: 18.2,
    resources: ["VPC", "Subnet", "EC2"],
    title: "내 프로젝트 1",
    updatedLabel: "4시간 전 수정"
  },
  {
    cloudServices: ["AWS"],
    deploymentStatus: "running",
    description: "ALB, EC2, RDS를 포함한 API 서버 설계",
    id: "project-aws-api",
    lastDeployedLabel: "1일 전 배포",
    lastOpenedLabel: "7시간 전 최종 수정",
    monthlyCostUsd: 32.6,
    resources: ["ALB", "EC2", "RDS"],
    title: "aws 연결 실습",
    updatedLabel: "7시간 전 수정"
  },
  {
    cloudServices: ["AWS", "Kubernetes"],
    deploymentStatus: "stopped",
    description: "EKS worker와 RDS 연결을 검토하는 연습 설계",
    id: "project-eks-rds",
    lastDeployedLabel: "3일 전 배포",
    lastOpenedLabel: "어제 최종 수정",
    monthlyCostUsd: 0,
    resources: ["EKS", "RDS", "IAM"],
    title: "컨테이너 API 샌드박스",
    updatedLabel: "어제 수정"
  },
  {
    cloudServices: ["GCP"],
    deploymentStatus: "not_deployed",
    description: "Cloud Run과 Cloud SQL 기반 비용 비교용 설계",
    id: "project-gcp-run",
    lastDeployedLabel: null,
    lastOpenedLabel: "2일 전 최종 수정",
    monthlyCostUsd: 0,
    resources: ["Cloud Run", "Cloud SQL"],
    title: "GCP 서버리스 비교",
    updatedLabel: "2일 전 수정"
  },
  {
    cloudServices: ["AWS"],
    deploymentStatus: "failed",
    description: "S3, CloudFront, Route53 기반 정적 사이트 배포 실습",
    id: "project-static-site",
    lastDeployedLabel: "5일 전 배포 실패",
    lastOpenedLabel: "5일 전 최종 수정",
    monthlyCostUsd: 4.1,
    resources: ["S3", "CloudFront", "Route53"],
    title: "정적 사이트 배포",
    updatedLabel: "5일 전 수정"
  }
];

export const marketplaceTemplates: readonly MarketplaceTemplate[] = [
  {
    cloudServices: ["AWS"],
    description: "VPC, ALB, EC2, RDS를 분리한 기본 3-tier 아키텍처",
    id: "template-aws-3tier",
    likeCount: 128,
    liked: true,
    ownerName: "infra-lab",
    priceUsd: 0,
    purchased: true,
    title: "AWS 3-tier web"
  },
  {
    cloudServices: ["AWS", "Kubernetes"],
    description: "EKS ingress, service, private RDS 연결을 포함한 운영형 템플릿",
    id: "template-eks-rds",
    likeCount: 76,
    liked: false,
    ownerName: "cloud-market",
    priceUsd: 12,
    purchased: false,
    title: "EKS private API starter"
  },
  {
    cloudServices: ["GCP"],
    description: "Cloud Run, Cloud SQL, Secret Manager를 연결한 서버리스 템플릿",
    id: "template-gcp-run",
    likeCount: 43,
    liked: false,
    ownerName: "gcp-note",
    priceUsd: 0,
    purchased: true,
    title: "GCP Cloud Run API"
  }
];

export const ownedTemplates: readonly OwnedTemplate[] = [
  {
    cloudServices: ["AWS"],
    description: "초기 팀 프로젝트용 VPC, EC2, RDS 템플릿",
    id: "owned-template-api",
    title: "팀 API 서버 기본형",
    updatedLabel: "오늘 수정"
  },
  {
    cloudServices: ["AWS"],
    description: "정적 웹 배포와 CDN 캐시 정책을 묶은 템플릿",
    id: "owned-template-static",
    title: "S3 CloudFront 정적 배포",
    updatedLabel: "어제 수정"
  }
];

export const runningDeployments = projects.filter(
  (project) => project.deploymentStatus === "running"
);

export const recentOpenedProjects = projects.slice(0, 3);

export const recentDeployedProjects = projects
  .filter((project) => project.lastDeployedLabel !== null)
  .slice(0, 3);

export function getProjectById(projectId: string): ProjectSummary | undefined {
  return projects.find((project) => project.id === projectId);
}

export function getProjectHref(projectId: string): string {
  return `/projects/${projectId}`;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

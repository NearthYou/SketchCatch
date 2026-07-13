import { BRAINBOARD_TEMPLATE_IDS, type BrainboardTemplateId } from "./ids.js";

export const BRAINBOARD_TEMPLATE_AUTHOR = "Chafik Belhaoues" as const;
export const BRAINBOARD_TEMPLATE_PROVIDER = "aws" as const;

export type BrainboardTemplateManifestEntry = {
  readonly id: BrainboardTemplateId;
  readonly sourceTemplateId: string;
  readonly title: string;
  readonly author: typeof BRAINBOARD_TEMPLATE_AUTHOR;
  readonly provider: typeof BRAINBOARD_TEMPLATE_PROVIDER;
  readonly downloads: number;
};

export const brainboardTemplateManifest = [
  {
    id: BRAINBOARD_TEMPLATE_IDS[0],
    sourceTemplateId: "d71155af-5339-44f1-ae11-2bcd29411c2d",
    title: "[Training] AWS onboarding",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 19_855
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[1],
    sourceTemplateId: "43b2ae45-cae5-4a06-83d3-2c5007e0c49b",
    title: "AWS Kubernetes cluster with native CNIs",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 1_414
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[2],
    sourceTemplateId: "a9b3f02c-a950-4153-92d2-47905dd8ffd3",
    title: "AWS VPC with subnet and security groups on 2 AZs",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 1_055
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[3],
    sourceTemplateId: "45191152-00cd-443d-a7f5-9a7295120e48",
    title: "AWS serverless architecture with CDN",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 812
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[4],
    sourceTemplateId: "9009bff8-8177-4022-ad39-6035ad4acd05",
    title: "AWS EC2 instance inside VPC & Subnet",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 684
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[5],
    sourceTemplateId: "f161f840-d697-4651-aa8d-6ec05b981a79",
    title: "AWS ASG and LB with VPC & subnets",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 655
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[6],
    sourceTemplateId: "c884d82a-6fab-454f-a984-619d65ad6044",
    title: "AWS Jenkins architecture on EC2",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 637
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[7],
    sourceTemplateId: "9447b484-b256-42b3-b933-ced015820d0b",
    title: "AWS REST API for DocumentDB",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 631
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[8],
    sourceTemplateId: "32450f82-e196-4602-853c-c55c0cb9718e",
    title: "AWS network landing zone",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 537
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[9],
    sourceTemplateId: "fb2334bf-3291-40db-a779-1e4e56df27dd",
    title: "AWS 3-tier web app with a database",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 489
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[10],
    sourceTemplateId: "130f8091-21a4-4e8b-8b39-2373cb720d72",
    title: "AWS Bastion",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 485
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[11],
    sourceTemplateId: "09fd3420-d8f0-409c-a1cc-694dba97443f",
    title: "AWS instance and DB with multiple networks",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 460
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[12],
    sourceTemplateId: "85dda071-ea16-4cbc-9d77-7cebe6ebaadd",
    title: "AWS load balancer with target group",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 300
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[13],
    sourceTemplateId: "73327761-bb6a-4516-92e5-f06007e372ec",
    title: "AWS S3 API Gateway integration",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 299
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[14],
    sourceTemplateId: "6e651e34-318d-41e2-b229-86d30aa0520f",
    title: "AWS costs monitoring",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 292
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[15],
    sourceTemplateId: "18b7b40a-8493-4ebb-ad21-0eb85f6ae257",
    title: "AWS ECS with Fargate",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 280
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[16],
    sourceTemplateId: "a432a178-bbcb-4353-a6e4-fd6a557941e6",
    title: "AWS multi-account management",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 220
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[17],
    sourceTemplateId: "eb84baae-e3a7-4d39-b80d-a22466e5ea16",
    title: "AWS Elastic Beanstalk",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 216
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[18],
    sourceTemplateId: "f588fabc-5991-44de-b9cc-5afd1d74e710",
    title: "AWS RDS",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 203
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[19],
    sourceTemplateId: "a1a4b134-bc00-4f97-82b8-46346da8ecde",
    title: "AWS FSX architecture",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 68
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[20],
    sourceTemplateId: "6e3d35f1-eeb7-4015-9814-c3959928a3ac",
    title: "Cross account AWS S3",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 68
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[21],
    sourceTemplateId: "46009873-0596-40b3-bcf4-b466428c54b4",
    title: "AWS IAM users creation",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 56
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[22],
    sourceTemplateId: "4e26a41a-78e5-43df-8c32-e6f1e47e40cb",
    title: "AWS Dashcam Video Processing Pipeline",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 38
  },
  {
    id: BRAINBOARD_TEMPLATE_IDS[23],
    sourceTemplateId: "83a63920-3c99-4e86-9f42-a46de416e124",
    title: "AWS secure S3 bucket",
    author: BRAINBOARD_TEMPLATE_AUTHOR,
    provider: BRAINBOARD_TEMPLATE_PROVIDER,
    downloads: 0
  }
] as const satisfies readonly BrainboardTemplateManifestEntry[];

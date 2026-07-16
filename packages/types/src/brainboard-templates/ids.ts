export const BRAINBOARD_TEMPLATE_IDS = [
  "brainboard-training-aws-onboarding",
  "brainboard-aws-kubernetes-native-cnis",
  "brainboard-aws-vpc-subnets-security-groups-2az",
  "brainboard-aws-serverless-cdn",
  "brainboard-aws-ec2-vpc-subnet",
  "brainboard-aws-asg-lb-vpc-subnets",
  "brainboard-aws-jenkins-ec2",
  "brainboard-aws-rest-api-documentdb",
  "brainboard-aws-network-landing-zone",
  "brainboard-aws-three-tier-database",
  "brainboard-aws-bastion",
  "brainboard-aws-instance-db-multiple-networks",
  "brainboard-aws-load-balancer-target-group",
  "brainboard-aws-s3-api-gateway",
  "brainboard-aws-costs-monitoring",
  "brainboard-aws-ecs-fargate",
  "brainboard-aws-multi-account-management",
  "brainboard-aws-elastic-beanstalk",
  "brainboard-aws-rds",
  "brainboard-aws-fsx",
  "brainboard-cross-account-aws-s3",
  "brainboard-aws-iam-users",
  "brainboard-aws-dashcam-video-pipeline",
  "brainboard-aws-secure-s3-bucket"
] as const;

export type BrainboardTemplateId = (typeof BRAINBOARD_TEMPLATE_IDS)[number];

export const AVAILABLE_BRAINBOARD_TEMPLATE_IDS = [
  "brainboard-training-aws-onboarding",
  "brainboard-aws-kubernetes-native-cnis",
  "brainboard-aws-vpc-subnets-security-groups-2az",
  "brainboard-aws-serverless-cdn",
  "brainboard-aws-ec2-vpc-subnet",
  "brainboard-aws-asg-lb-vpc-subnets",
  "brainboard-aws-jenkins-ec2",
  "brainboard-aws-rest-api-documentdb",
  "brainboard-aws-network-landing-zone",
  "brainboard-aws-three-tier-database",
  "brainboard-aws-bastion",
  "brainboard-aws-load-balancer-target-group",
  "brainboard-aws-s3-api-gateway",
  "brainboard-aws-costs-monitoring",
  "brainboard-aws-ecs-fargate",
  "brainboard-aws-multi-account-management",
  "brainboard-aws-elastic-beanstalk",
  "brainboard-aws-rds",
  "brainboard-aws-fsx",
  "brainboard-cross-account-aws-s3",
  "brainboard-aws-iam-users",
  "brainboard-aws-dashcam-video-pipeline",
  "brainboard-aws-secure-s3-bucket"
] as const satisfies readonly BrainboardTemplateId[];

export type AvailableBrainboardTemplateId = (typeof AVAILABLE_BRAINBOARD_TEMPLATE_IDS)[number];

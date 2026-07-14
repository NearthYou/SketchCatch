import type { BrainboardTemplateSource } from "../source-types.ts";
import { awsAsgLoadBalancerVpcSource } from "./aws-asg-load-balancer-vpc.ts";
import { awsBastionSource } from "./aws-bastion.ts";
import { awsCostMonitoringSource } from "./aws-cost-monitoring.ts";
import { awsDashcamVideoProcessingSource } from "./aws-dashcam-video-processing.ts";
import { awsEc2VpcSubnetSource } from "./aws-ec2-vpc-subnet.ts";
import { awsEcsFargateSource } from "./aws-ecs-fargate.ts";
import { awsElasticBeanstalkSource } from "./aws-elastic-beanstalk.ts";
import { awsFsxSource } from "./aws-fsx.ts";
import { awsIamUsersSource } from "./aws-iam-users.ts";
import { awsJenkinsEc2Source } from "./aws-jenkins-ec2.ts";
import { awsKubernetesNativeCnisSource } from "./aws-kubernetes-native-cnis.ts";
import { awsLoadBalancerTargetGroupSource } from "./aws-load-balancer-target-group.ts";
import { awsMultiAccountManagementSource } from "./aws-multi-account-management.ts";
import { awsNetworkLandingZoneSource } from "./aws-network-landing-zone.ts";
import { awsRdsSource } from "./aws-rds.ts";
import { awsRestApiDocumentDbSource } from "./aws-rest-api-documentdb.ts";
import { awsS3ApiGatewaySource } from "./aws-s3-api-gateway.ts";
import { awsSecureS3BucketSource } from "./aws-secure-s3-bucket.ts";
import { awsServerlessCdnSource } from "./aws-serverless-cdn.ts";
import { awsThreeTierDatabaseSource } from "./aws-three-tier-database.ts";
import { awsVpcSubnetsSecurityGroups2azSource } from "./aws-vpc-subnets-security-groups-2az.ts";
import { crossAccountAwsS3Source } from "./cross-account-aws-s3.ts";
import { trainingAwsOnboardingSource } from "./training-aws-onboarding.ts";

export { awsAsgLoadBalancerVpcSource } from "./aws-asg-load-balancer-vpc.ts";
export { awsBastionSource } from "./aws-bastion.ts";
export { awsCostMonitoringSource } from "./aws-cost-monitoring.ts";
export { awsDashcamVideoProcessingSource } from "./aws-dashcam-video-processing.ts";
export { awsEc2VpcSubnetSource } from "./aws-ec2-vpc-subnet.ts";
export { awsEcsFargateSource } from "./aws-ecs-fargate.ts";
export { awsElasticBeanstalkSource } from "./aws-elastic-beanstalk.ts";
export { awsFsxSource } from "./aws-fsx.ts";
export { awsIamUsersSource } from "./aws-iam-users.ts";
export { awsInstanceDatabaseMultipleNetworksFailedEvidence } from "./aws-instance-database-multiple-networks.ts";
export { awsJenkinsEc2Source } from "./aws-jenkins-ec2.ts";
export { awsKubernetesNativeCnisSource } from "./aws-kubernetes-native-cnis.ts";
export { awsLoadBalancerTargetGroupSource } from "./aws-load-balancer-target-group.ts";
export { awsMultiAccountManagementSource } from "./aws-multi-account-management.ts";
export { awsNetworkLandingZoneSource } from "./aws-network-landing-zone.ts";
export { awsRdsSource } from "./aws-rds.ts";
export { awsRestApiDocumentDbSource } from "./aws-rest-api-documentdb.ts";
export { awsS3ApiGatewaySource } from "./aws-s3-api-gateway.ts";
export { awsSecureS3BucketSource } from "./aws-secure-s3-bucket.ts";
export { awsServerlessCdnSource } from "./aws-serverless-cdn.ts";
export { awsThreeTierDatabaseSource } from "./aws-three-tier-database.ts";
export { awsVpcSubnetsSecurityGroups2azSource } from "./aws-vpc-subnets-security-groups-2az.ts";
export { crossAccountAwsS3Source } from "./cross-account-aws-s3.ts";
export { trainingAwsOnboardingSource } from "./training-aws-onboarding.ts";

export const brainboardTemplateSources = [
  trainingAwsOnboardingSource,
  awsKubernetesNativeCnisSource,
  awsVpcSubnetsSecurityGroups2azSource,
  awsServerlessCdnSource,
  awsEc2VpcSubnetSource,
  awsAsgLoadBalancerVpcSource,
  awsJenkinsEc2Source,
  awsRestApiDocumentDbSource,
  awsNetworkLandingZoneSource,
  awsThreeTierDatabaseSource,
  awsBastionSource,
  awsLoadBalancerTargetGroupSource,
  awsS3ApiGatewaySource,
  awsCostMonitoringSource,
  awsEcsFargateSource,
  awsMultiAccountManagementSource,
  awsElasticBeanstalkSource,
  awsRdsSource,
  awsFsxSource,
  crossAccountAwsS3Source,
  awsIamUsersSource,
  awsDashcamVideoProcessingSource,
  awsSecureS3BucketSource
] as const satisfies readonly BrainboardTemplateSource[];

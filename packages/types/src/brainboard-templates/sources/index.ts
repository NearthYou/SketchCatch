import type { BrainboardTemplateSource } from "../source-types.js";
import { awsAsgLoadBalancerVpcSource } from "./aws-asg-load-balancer-vpc.js";
import { awsBastionSource } from "./aws-bastion.js";
import { awsCostMonitoringSource } from "./aws-cost-monitoring.js";
import { awsDashcamVideoProcessingSource } from "./aws-dashcam-video-processing.js";
import { awsEc2VpcSubnetSource } from "./aws-ec2-vpc-subnet.js";
import { awsEcsFargateSource } from "./aws-ecs-fargate.js";
import { awsElasticBeanstalkSource } from "./aws-elastic-beanstalk.js";
import { awsFsxSource } from "./aws-fsx.js";
import { awsIamUsersSource } from "./aws-iam-users.js";
import { awsJenkinsEc2Source } from "./aws-jenkins-ec2.js";
import { awsKubernetesNativeCnisSource } from "./aws-kubernetes-native-cnis.js";
import { awsLoadBalancerTargetGroupSource } from "./aws-load-balancer-target-group.js";
import { awsMultiAccountManagementSource } from "./aws-multi-account-management.js";
import { awsNetworkLandingZoneSource } from "./aws-network-landing-zone.js";
import { awsRdsSource } from "./aws-rds.js";
import { awsRestApiDocumentDbSource } from "./aws-rest-api-documentdb.js";
import { awsS3ApiGatewaySource } from "./aws-s3-api-gateway.js";
import { awsSecureS3BucketSource } from "./aws-secure-s3-bucket.js";
import { awsServerlessCdnSource } from "./aws-serverless-cdn.js";
import { awsThreeTierDatabaseSource } from "./aws-three-tier-database.js";
import { awsVpcSubnetsSecurityGroups2azSource } from "./aws-vpc-subnets-security-groups-2az.js";
import { crossAccountAwsS3Source } from "./cross-account-aws-s3.js";
import { trainingAwsOnboardingSource } from "./training-aws-onboarding.js";

export { awsAsgLoadBalancerVpcSource } from "./aws-asg-load-balancer-vpc.js";
export { awsBastionSource } from "./aws-bastion.js";
export { awsCostMonitoringSource } from "./aws-cost-monitoring.js";
export { awsDashcamVideoProcessingSource } from "./aws-dashcam-video-processing.js";
export { awsEc2VpcSubnetSource } from "./aws-ec2-vpc-subnet.js";
export { awsEcsFargateSource } from "./aws-ecs-fargate.js";
export { awsElasticBeanstalkSource } from "./aws-elastic-beanstalk.js";
export { awsFsxSource } from "./aws-fsx.js";
export { awsIamUsersSource } from "./aws-iam-users.js";
export { awsInstanceDatabaseMultipleNetworksFailedEvidence } from "./aws-instance-database-multiple-networks.js";
export { awsJenkinsEc2Source } from "./aws-jenkins-ec2.js";
export { awsKubernetesNativeCnisSource } from "./aws-kubernetes-native-cnis.js";
export { awsLoadBalancerTargetGroupSource } from "./aws-load-balancer-target-group.js";
export { awsMultiAccountManagementSource } from "./aws-multi-account-management.js";
export { awsNetworkLandingZoneSource } from "./aws-network-landing-zone.js";
export { awsRdsSource } from "./aws-rds.js";
export { awsRestApiDocumentDbSource } from "./aws-rest-api-documentdb.js";
export { awsS3ApiGatewaySource } from "./aws-s3-api-gateway.js";
export { awsSecureS3BucketSource } from "./aws-secure-s3-bucket.js";
export { awsServerlessCdnSource } from "./aws-serverless-cdn.js";
export { awsThreeTierDatabaseSource } from "./aws-three-tier-database.js";
export { awsVpcSubnetsSecurityGroups2azSource } from "./aws-vpc-subnets-security-groups-2az.js";
export { crossAccountAwsS3Source } from "./cross-account-aws-s3.js";
export { trainingAwsOnboardingSource } from "./training-aws-onboarding.js";

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

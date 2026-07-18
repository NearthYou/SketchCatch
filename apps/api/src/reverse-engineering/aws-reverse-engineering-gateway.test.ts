import assert from "node:assert/strict";
import test from "node:test";
import {
  DescribeLoadBalancersCommand
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
import {
  DescribeClustersCommand,
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ListClustersCommand,
  ListServicesCommand
} from "@aws-sdk/client-ecs";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import type { AwsDiscoveredResourceRecord, AwsProviderScanInput } from "./aws-provider-adapter.js";
import {
  createAwsReverseEngineeringReaderPlan,
  deduplicateReverseEngineeringScanErrors,
  isReverseEngineeringPromotedResourceArn,
  listApplicationLoadBalancers,
  listCloudFrontDistributions,
  readEcsResourcesWithDiagnostics,
  resolveCloudFrontOriginRelationships
} from "./aws-reverse-engineering-gateway.js";

const credentials: TerraformAwsCredentialEnv = {
  AWS_ACCESS_KEY_ID: "fixture-access-key",
  AWS_SECRET_ACCESS_KEY: "fixture-secret-key",
  AWS_REGION: "ap-northeast-2"
};

function scanInput(resourceTypes: AwsProviderScanInput["resourceTypes"]): AwsProviderScanInput {
  return { provider: "aws", region: "ap-northeast-2", resourceTypes };
}

test("ALB와 CloudFront reader 선택은 ALL 및 직접 선택에만 한 번씩 포함한다", () => {
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["ALL"])), {
    loadBalancers: true,
    cloudFrontDistributions: true,
    ecsResources: true,
    unknownResources: true
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["LOAD_BALANCER"])), {
    loadBalancers: true,
    cloudFrontDistributions: false,
    ecsResources: false,
    unknownResources: false
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["CLOUDFRONT"])), {
    loadBalancers: false,
    cloudFrontDistributions: true,
    ecsResources: false,
    unknownResources: false
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["UNKNOWN"])), {
    loadBalancers: false,
    cloudFrontDistributions: false,
    ecsResources: false,
    unknownResources: true
  });

  for (const resourceType of [
    "ECS_CLUSTER",
    "ECS_SERVICE",
    "ECS_TASK_DEFINITION"
  ] as const) {
    assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput([resourceType])), {
      loadBalancers: false,
      cloudFrontDistributions: false,
      ecsResources: true,
      unknownResources: false
    });
  }
});

test("같은 AWS 서비스의 반복 실패는 사용자 결과에서 한 번만 남긴다", () => {
  const errors = deduplicateReverseEngineeringScanErrors([
    {
      id: "scan-error-service-ec2",
      resourceType: "VPC",
      stage: "provider_api",
      reason: "permission_denied",
      message: "VPC denied",
      retryable: false
    },
    {
      id: "scan-error-service-ec2",
      resourceType: "SUBNET",
      stage: "provider_api",
      reason: "permission_denied",
      message: "Subnet denied",
      retryable: false
    },
    {
      id: "scan-error-service-ecs",
      resourceType: "ECS_SERVICE",
      stage: "provider_api",
      reason: "throttled",
      message: "ECS throttled",
      retryable: true
    }
  ]);

  assert.deepEqual(
    errors.map(({ id, resourceType }) => ({ id, resourceType })),
    [
      { id: "scan-error-service-ec2", resourceType: "VPC" },
      { id: "scan-error-service-ecs", resourceType: "ECS_SERVICE" }
    ]
  );
});

test("ECS reader는 cluster/service pagination과 공유 Task Definition dedupe를 지키며 환경 값을 제외한다", async () => {
  const clusterA = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders";
  const clusterB = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/empty";
  const serviceA = "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api";
  const serviceB = "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/worker";
  const taskDefinition = "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7";
  const commands: object[] = [];
  const result = await readEcsResourcesWithDiagnostics(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command);

        if (command instanceof ListClustersCommand) {
          return command.input.nextToken
            ? { clusterArns: [clusterB] }
            : { clusterArns: [clusterA], nextToken: "clusters-page-2" };
        }

        if (command instanceof DescribeClustersCommand) {
          return {
            clusters: [
              {
                clusterArn: clusterA,
                clusterName: "orders",
                status: "ACTIVE",
                configuration: {
                  executeCommandConfiguration: {
                    logging: "DEFAULT"
                  }
                },
                capacityProviders: ["FARGATE", "FARGATE_SPOT"]
              },
              {
                clusterArn: clusterB,
                clusterName: "empty",
                status: "ACTIVE"
              }
            ]
          };
        }

        if (command instanceof ListServicesCommand) {
          if (command.input.cluster === clusterB) {
            return { serviceArns: [] };
          }

          return command.input.nextToken
            ? { serviceArns: [serviceB] }
            : { serviceArns: [serviceA], nextToken: "services-page-2" };
        }

        if (command instanceof DescribeServicesCommand) {
          return {
            services: [
              {
                serviceArn: serviceA,
                serviceName: "api",
                clusterArn: clusterA,
                taskDefinition,
                desiredCount: 2,
                launchType: "FARGATE",
                networkConfiguration: {
                  awsvpcConfiguration: {
                    subnets: ["subnet-private-a"],
                    securityGroups: ["sg-api"],
                    assignPublicIp: "DISABLED"
                  }
                },
                loadBalancers: [
                  {
                    targetGroupArn:
                      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/api/one",
                    containerName: "api",
                    containerPort: 4000
                  }
                ]
              },
              {
                serviceArn: serviceB,
                serviceName: "worker",
                clusterArn: clusterA,
                taskDefinition,
                desiredCount: 1,
                capacityProviderStrategy: [{ capacityProvider: "FARGATE_SPOT", weight: 1 }],
                networkConfiguration: {
                  awsvpcConfiguration: {
                    subnets: ["subnet-private-a"],
                    securityGroups: ["sg-worker"],
                    assignPublicIp: "DISABLED"
                  }
                }
              }
            ]
          };
        }

        if (command instanceof DescribeTaskDefinitionCommand) {
          return {
            taskDefinition: {
              taskDefinitionArn: taskDefinition,
              family: "orders",
              revision: 7,
              networkMode: "awsvpc",
              requiresCompatibilities: ["FARGATE"],
              cpu: "512",
              memory: "1024",
              executionRoleArn: "arn:aws:iam::123456789012:role/ecs-execution",
              taskRoleArn: "arn:aws:iam::123456789012:role/orders-task",
              containerDefinitions: [
                {
                  name: "api",
                  image: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:stable",
                  essential: true,
                  environment: [{ name: "API_TOKEN", value: "must-not-leak" }],
                  secrets: [
                    {
                      name: "DATABASE_URL",
                      valueFrom: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:db"
                    }
                  ],
                  portMappings: [{ containerPort: 4000, protocol: "tcp" }],
                  rawSdkField: "must-not-copy"
                }
              ],
              $metadata: { requestId: "must-not-copy" }
            },
            $metadata: { requestId: "must-not-copy" }
          };
        }

        throw new Error(`Unexpected ECS command: ${command.constructor.name}`);
      }
    })
  );

  assert.deepEqual(result.scanErrors, []);
  assert.deepEqual(
    commands.filter((command) => command instanceof ListClustersCommand).map((command) => command.input.nextToken),
    [undefined, "clusters-page-2"]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is DescribeClustersCommand => command instanceof DescribeClustersCommand
      )
      .map((command) => command.input),
    [{ clusters: [clusterA, clusterB], include: ["CONFIGURATIONS"] }]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is ListServicesCommand =>
          command instanceof ListServicesCommand && command.input.cluster === clusterA
      )
      .map((command) => command.input.nextToken),
    [undefined, "services-page-2"]
  );
  assert.equal(commands.filter((command) => command instanceof DescribeTaskDefinitionCommand).length, 1);
  assert.deepEqual(
    result.records.map((record) => record.providerResourceType),
    [
      "AWS::ECS::Cluster",
      "AWS::ECS::Cluster",
      "AWS::ECS::Service",
      "AWS::ECS::Service",
      "AWS::ECS::TaskDefinition"
    ]
  );
  assert.deepEqual(
    result.records.map((record) => record.providerResourceId),
    [clusterA, clusterB, serviceA, serviceB, taskDefinition]
  );

  const apiService = result.records.find((record) => record.providerResourceId === serviceA);
  assert.deepEqual(apiService?.relationships, [
    { type: "depends_on", targetProviderResourceId: clusterA },
    { type: "depends_on", targetProviderResourceId: taskDefinition }
  ]);
  const taskDefinitionRecord = result.records.find(
    (record) => record.providerResourceId === taskDefinition
  );
  assert.equal(taskDefinitionRecord?.config["requiresManualEnvironmentInput"], true);
  assert.deepEqual(taskDefinitionRecord?.config["containerDefinitions"], [
    {
      name: "api",
      image: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:stable",
      essential: true,
      portMappings: [{ containerPort: 4000, protocol: "tcp" }],
      secrets: [
        {
          name: "DATABASE_URL",
          valueFrom: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:db"
        }
      ]
    }
  ]);
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak|must-not-copy|\$metadata/);
});

test("한 Cluster의 service 조회 실패는 다른 ECS 결과를 유지하고 하위 group scanError로 남긴다", async () => {
  const healthyCluster = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/healthy";
  const deniedCluster = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/denied";
  const healthyService = "arn:aws:ecs:ap-northeast-2:123456789012:service/healthy/api";
  const result = await readEcsResourcesWithDiagnostics(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof ListClustersCommand) {
          return { clusterArns: [healthyCluster, deniedCluster] };
        }
        if (command instanceof DescribeClustersCommand) {
          return {
            clusters: [
              { clusterArn: healthyCluster, clusterName: "healthy", status: "ACTIVE" },
              { clusterArn: deniedCluster, clusterName: "denied", status: "ACTIVE" }
            ]
          };
        }
        if (command instanceof ListServicesCommand) {
          if (command.input.cluster === deniedCluster) {
            throw new Error(
              "AccessDeniedException: arn:aws:iam::123456789012:role/internal cannot call ecs:ListServices RequestId: private-request-id"
            );
          }
          return { serviceArns: [healthyService] };
        }
        if (command instanceof DescribeServicesCommand) {
          return {
            services: [
              {
                serviceArn: healthyService,
                serviceName: "api",
                clusterArn: healthyCluster,
                desiredCount: 1,
                launchType: "FARGATE"
              }
            ]
          };
        }
        throw new Error(`Unexpected ECS command: ${command.constructor.name}`);
      }
    })
  );

  assert.deepEqual(
    result.records.map((record) => record.providerResourceId),
    [healthyCluster, deniedCluster, healthyService]
  );
  assert.equal(result.scanErrors.length, 1);
  assert.equal(result.scanErrors[0]?.resourceType, "ECS_SERVICE");
  assert.equal(result.scanErrors[0]?.reason, "permission_denied");
  assert.doesNotMatch(result.scanErrors[0]?.message ?? "", /123456789012/);
  assert.doesNotMatch(
    result.scanErrors[0]?.message ?? "",
    /AccessDenied|arn:aws|ListServices|RequestId|private-request-id/
  );
});

test("ALB reader는 pagination을 끝까지 읽고 실제 VPC, Security Group, Subnet 관계만 정규화한다", async () => {
  const commands: object[] = [];
  const records = await listApplicationLoadBalancers(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command);
        return commands.length === 1
          ? {
              LoadBalancers: [
                {
                  LoadBalancerArn:
                    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
                  LoadBalancerName: "orders",
                  Type: "application",
                  Scheme: "internet-facing",
                  DNSName: "orders-123.ap-northeast-2.elb.amazonaws.com",
                  VpcId: "vpc-orders",
                  SecurityGroups: ["sg-web"],
                  AvailabilityZones: [
                    { ZoneName: "ap-northeast-2a", SubnetId: "subnet-public-a" }
                  ],
                  State: { Code: "active" },
                  IpAddressType: "ipv4"
                },
                {
                  LoadBalancerArn:
                    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/net/not-an-alb/two",
                  LoadBalancerName: "not-an-alb",
                  Type: "network"
                }
              ],
              NextMarker: "next-page"
            }
          : { LoadBalancers: [] };
      }
    })
  );

  assert.equal(commands.length, 2);
  assert.ok(commands[0] instanceof DescribeLoadBalancersCommand);
  assert.ok(commands[1] instanceof DescribeLoadBalancersCommand);
  assert.equal((commands[0] as DescribeLoadBalancersCommand).input.Marker, undefined);
  assert.equal((commands[1] as DescribeLoadBalancersCommand).input.Marker, "next-page");
  assert.deepEqual(records, [
    {
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
      displayName: "orders",
      region: "ap-northeast-2",
      config: {
        arn: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
        name: "orders",
        type: "application",
        ipAddressType: "ipv4",
        scheme: "internet-facing",
        dnsName: "orders-123.ap-northeast-2.elb.amazonaws.com",
        vpcId: "vpc-orders",
        securityGroupIds: ["sg-web"],
        subnetIds: ["subnet-public-a"],
        availabilityZones: [{ availabilityZone: "ap-northeast-2a", subnetId: "subnet-public-a" }]
      },
      relationships: [
        { type: "depends_on", targetProviderResourceId: "vpc-orders" },
        { type: "attached_to", targetProviderResourceId: "sg-web" }
      ]
    }
  ]);
});

test("CloudFront reader는 distribution ID와 생성에 필요한 응답 구조만 보존한다", async () => {
  const commands: object[] = [];
  const records = await listCloudFrontDistributions(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command);
        return {
          DistributionList: {
            Items: [
              {
                ARN: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
                Id: "EDISTRIBUTION",
                DomainName: "d111111abcdef8.cloudfront.net",
                Comment: "orders entry",
                Enabled: true,
                Status: "Deployed",
                Origins: {
                  Items: [
                    {
                      Id: "orders-alb",
                      DomainName: "orders-123.ap-northeast-2.elb.amazonaws.com",
                      CustomOriginConfig: {
                        HTTPPort: 80,
                        HTTPSPort: 443,
                        OriginProtocolPolicy: "https-only",
                        OriginSslProtocols: { Items: ["TLSv1.2"] }
                      }
                    }
                  ]
                },
                DefaultCacheBehavior: {
                  TargetOriginId: "orders-alb",
                  ViewerProtocolPolicy: "redirect-to-https",
                  AllowedMethods: {
                    Items: ["GET", "HEAD"],
                    CachedMethods: { Items: ["GET", "HEAD"] }
                  },
                  ForwardedValues: {
                    QueryString: false,
                    Cookies: { Forward: "none" }
                  }
                },
                Restrictions: { GeoRestriction: { RestrictionType: "none" } },
                ViewerCertificate: { CloudFrontDefaultCertificate: true }
              }
            ]
          }
        };
      }
    })
  );

  assert.equal(commands.length, 1);
  assert.ok(commands[0] instanceof ListDistributionsCommand);
  assert.deepEqual(records, [
    {
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
      displayName: "d111111abcdef8.cloudfront.net",
      region: "global",
      config: {
        arn: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
        accountId: "123456789012",
        id: "EDISTRIBUTION",
        domainName: "d111111abcdef8.cloudfront.net",
        comment: "orders entry",
        enabled: true,
        status: "Deployed",
        origin: [
          {
            originId: "orders-alb",
            domainName: "orders-123.ap-northeast-2.elb.amazonaws.com",
            customOriginConfig: {
              httpPort: 80,
              httpsPort: 443,
              originProtocolPolicy: "https-only",
              originSslProtocols: ["TLSv1.2"]
            }
          }
        ],
        defaultCacheBehavior: {
          targetOriginId: "orders-alb",
          viewerProtocolPolicy: "redirect-to-https",
          allowedMethods: ["GET", "HEAD"],
          cachedMethods: ["GET", "HEAD"],
          forwardedValues: { queryString: false, cookies: { forward: "none" } }
        },
        restrictions: { geoRestriction: { restrictionType: "none" } },
        viewerCertificate: { cloudfrontDefaultCertificate: true }
      },
      relationships: []
    }
  ]);
});

test("CloudFront reader는 VpcOriginConfig를 보존해 새 Terraform 생성 경계를 판단할 수 있게 한다", async () => {
  const records = await listCloudFrontDistributions(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(): Promise<unknown> {
        return {
          DistributionList: {
            Items: [
              {
                ARN: "arn:aws:cloudfront::123456789012:distribution/EVPCORIGIN",
                Id: "EVPCORIGIN",
                DomainName: "d111111abcdef8.cloudfront.net",
                Origins: {
                  Items: [
                    {
                      Id: "private-origin",
                      DomainName: "internal.example.com",
                      VpcOriginConfig: {
                        VpcOriginId: "vo_0123456789abcdef0",
                        OwnerAccountId: "123456789012",
                        OriginReadTimeout: 30,
                        OriginKeepaliveTimeout: 5
                      }
                    }
                  ]
                }
              }
            ]
          }
        };
      }
    })
  );

  assert.deepEqual(records[0]?.config["origin"], [
    {
      originId: "private-origin",
      domainName: "internal.example.com",
      vpcOriginConfig: {
        vpcOriginId: "vo_0123456789abcdef0",
        ownerAccountId: "123456789012",
        originReadTimeout: 30,
        originKeepaliveTimeout: 5
      }
    }
  ]);
});

test("CloudFront origin은 동일 response 증거가 있는 ALB와 S3에만 연결한다", () => {
  const cloudFront: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::CloudFront::Distribution",
    providerResourceId: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
    displayName: "d111111abcdef8.cloudfront.net",
    region: "global",
    config: {
      origin: [
        { originId: "alb", domainName: "orders-123.ap-northeast-2.elb.amazonaws.com" },
        { originId: "assets", domainName: "assets.example.s3.ap-northeast-2.amazonaws.com" },
        { originId: "unrelated", domainName: "unrelated.example.com" }
      ]
    },
    relationships: []
  };
  const alb: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
    providerResourceId: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
    displayName: "orders",
    region: "ap-northeast-2",
    config: { dnsName: "orders-123.ap-northeast-2.elb.amazonaws.com" },
    relationships: []
  };
  const bucket: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "assets.example",
    displayName: "assets.example",
    region: "ap-northeast-2",
    config: {},
    relationships: []
  };

  const [resolvedCloudFront] = resolveCloudFrontOriginRelationships([cloudFront, alb, bucket]);

  assert.deepEqual(resolvedCloudFront?.relationships, [
    {
      type: "depends_on",
      targetProviderResourceId:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one"
    },
    { type: "depends_on", targetProviderResourceId: "assets.example" }
  ]);
});

test("CloudFront S3 origin은 AWS endpoint suffix가 아닌 lookalike hostname에 연결하지 않는다", () => {
  const cloudFront: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::CloudFront::Distribution",
    providerResourceId: "arn:aws:cloudfront::123456789012:distribution/ELOOKALIKE",
    displayName: "d111111abcdef8.cloudfront.net",
    region: "global",
    config: {
      origin: [{ originId: "assets", domainName: "assets.example.s3.example.com" }]
    },
    relationships: []
  };
  const bucket: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "assets.example",
    displayName: "assets.example",
    region: "ap-northeast-2",
    config: {},
    relationships: []
  };

  const [resolvedCloudFront] = resolveCloudFrontOriginRelationships([cloudFront, bucket]);

  assert.deepEqual(resolvedCloudFront?.relationships, []);
});

test("정식 reader가 맡는 ARN만 UNKNOWN inventory에서 제외한다", () => {
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7"
    ),
    true
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/net/orders/one"
    ),
    false
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:lambda:ap-northeast-2:123456789012:function:orders"
    ),
    false
  );
  assert.equal(
    isReverseEngineeringPromotedResourceArn(
      "arn:aws:ecs:ap-northeast-2:123456789012:task/orders/one"
    ),
    false
  );
});

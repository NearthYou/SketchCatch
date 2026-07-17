import assert from "node:assert/strict";
import test from "node:test";
import {
  DescribeLoadBalancersCommand
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import type { AwsDiscoveredResourceRecord, AwsProviderScanInput } from "./aws-provider-adapter.js";
import {
  createAwsReverseEngineeringReaderPlan,
  isReverseEngineeringPromotedResourceArn,
  listApplicationLoadBalancers,
  listCloudFrontDistributions,
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
    unknownResources: true
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["LOAD_BALANCER"])), {
    loadBalancers: true,
    cloudFrontDistributions: false,
    unknownResources: false
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["CLOUDFRONT"])), {
    loadBalancers: false,
    cloudFrontDistributions: true,
    unknownResources: false
  });
  assert.deepEqual(createAwsReverseEngineeringReaderPlan(scanInput(["UNKNOWN"])), {
    loadBalancers: false,
    cloudFrontDistributions: false,
    unknownResources: true
  });
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
});

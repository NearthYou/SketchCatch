import assert from "node:assert/strict";
import test from "node:test";

type Probe = (client: { send(command: object): Promise<unknown> }) => Promise<string>;

test("EC2 topology probe는 EIP와 NAT Gateway를 한 page씩 읽는다", async () => {
  const probe = await getProbe("probeEc2Topology");
  const calls = await runProbe(probe, (name) => {
    if (name === "DescribeAddressesCommand") {
      throw Object.assign(new Error("dry run"), { name: "DryRunOperation" });
    }
    return {};
  });

  assert.deepEqual(calls.map((call) => call.name), [
    "DescribeAddressesCommand",
    "DescribeNatGatewaysCommand"
  ]);
  assert.equal(calls[0]?.input["DryRun"], true);
  assert.equal(calls[1]?.input["MaxResults"], 5);
});

test("ELBv2 topology probe는 첫 Load Balancer의 속성, 관계와 태그를 읽는다", async () => {
  const probe = await getProbe("probeElbv2Topology");
  const loadBalancerArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/demo/1";
  const targetGroupArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/api/1";
  const listenerArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:listener/app/demo/1/2";
  const calls = await runProbe(probe, (name) => {
    if (name === "DescribeLoadBalancersCommand") {
      return { LoadBalancers: [{ LoadBalancerArn: loadBalancerArn }] };
    }
    if (name === "DescribeTargetGroupsCommand") {
      return { TargetGroups: [{ TargetGroupArn: targetGroupArn }] };
    }
    if (name === "DescribeListenersCommand") {
      return { Listeners: [{ ListenerArn: listenerArn, Protocol: "HTTPS" }] };
    }
    return {};
  });

  assert.deepEqual(calls.map((call) => call.name), [
    "DescribeLoadBalancersCommand",
    "DescribeLoadBalancerAttributesCommand",
    "DescribeTagsCommand",
    "DescribeTargetGroupsCommand",
    "DescribeTargetGroupAttributesCommand",
    "DescribeTagsCommand",
    "DescribeListenersCommand",
    "DescribeListenerAttributesCommand",
    "DescribeListenerCertificatesCommand"
  ]);
  assert.equal(calls[0]?.input["PageSize"], 1);
  assert.equal(calls[1]?.input["LoadBalancerArn"], loadBalancerArn);
  assert.deepEqual(calls[2]?.input["ResourceArns"], [loadBalancerArn]);
  assert.equal(calls[3]?.input["PageSize"], 1);
  assert.equal(calls[4]?.input["TargetGroupArn"], targetGroupArn);
  assert.deepEqual(calls[5]?.input["ResourceArns"], [targetGroupArn]);
  assert.equal(calls[6]?.input["PageSize"], 1);
  assert.equal(calls[7]?.input["ListenerArn"], listenerArn);
  assert.equal(calls[8]?.input["PageSize"], 1);
});

test("ECR topology probe는 첫 Repository metadata와 tag만 읽는다", async () => {
  const probe = await getProbe("probeEcr");
  const repositoryArn = "arn:aws:ecr:ap-northeast-2:123456789012:repository/demo";
  const calls = await runProbe(probe, (name) =>
    name === "DescribeRepositoriesCommand"
      ? { repositories: [{ repositoryArn }] }
      : {}
  );

  assert.deepEqual(calls.map((call) => call.name), [
    "DescribeRepositoriesCommand",
    "ListTagsForResourceCommand"
  ]);
  assert.equal(calls[0]?.input["maxResults"], 1);
  assert.equal(calls[1]?.input["resourceArn"], repositoryArn);
});

test("Secrets Manager topology probe는 첫 Secret metadata만 읽고 값은 요청하지 않는다", async () => {
  const probe = await getProbe("probeSecretsManager");
  const secretArn = "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:demo";
  const calls = await runProbe(probe, (name) =>
    name === "ListSecretsCommand" ? { SecretList: [{ ARN: secretArn }] } : {}
  );

  assert.deepEqual(calls.map((call) => call.name), ["ListSecretsCommand", "DescribeSecretCommand"]);
  assert.equal(calls[0]?.input["MaxResults"], 1);
  assert.equal(calls[1]?.input["SecretId"], secretArn);
  assert.doesNotMatch(JSON.stringify(calls), /GetSecretValue/u);
});

test("Application Auto Scaling probe는 첫 ECS target과 policy만 읽는다", async () => {
  const probe = await getProbe("probeApplicationAutoScaling");
  const scalableTargetArn =
    "arn:aws:application-autoscaling:ap-northeast-2:123456789012:scalable-target/demo";
  const calls = await runProbe(probe, (name) =>
    name === "DescribeScalableTargetsCommand"
      ? {
          ScalableTargets: [{
            ResourceId: "service/demo/api",
            ScalableDimension: "ecs:service:DesiredCount",
            ServiceNamespace: "ecs",
            ScalableTargetARN: scalableTargetArn
          }]
        }
      : {}
  );

  assert.deepEqual(calls.map((call) => call.name), [
    "DescribeScalableTargetsCommand",
    "DescribeScalingPoliciesCommand",
    "ListTagsForResourceCommand"
  ]);
  assert.equal(calls[0]?.input["MaxResults"], 1);
  assert.equal(calls[1]?.input["MaxResults"], 1);
  assert.equal(calls[1]?.input["ResourceId"], "service/demo/api");
  assert.equal(calls[1]?.input["ScalableDimension"], "ecs:service:DesiredCount");
  assert.equal(calls[1]?.input["ServiceNamespace"], "ecs");
  assert.equal(calls[2]?.input["ResourceARN"], scalableTargetArn);
});

test("CloudFront topology probe는 Distribution과 OAC metadata를 bounded read한다", async () => {
  const probe = await getProbe("probeCloudFrontTopology");
  const distributionArn = "arn:aws:cloudfront::123456789012:distribution/D1";
  const calls = await runProbe(probe, (name) => {
    if (name === "ListDistributionsCommand") {
      return { DistributionList: { Items: [{ ARN: distributionArn, Id: "D1" }] } };
    }
    if (name === "ListOriginAccessControlsCommand") {
      return { OriginAccessControlList: { Items: [{ Id: "oac-demo" }] } };
    }
    return {};
  });

  assert.deepEqual(calls.map((call) => call.name), [
    "ListDistributionsCommand",
    "GetDistributionConfigCommand",
    "ListTagsForResourceCommand",
    "ListOriginAccessControlsCommand",
    "GetOriginAccessControlCommand"
  ]);
  assert.equal(calls[0]?.input["MaxItems"], 1);
  assert.equal(calls[1]?.input["Id"], "D1");
  assert.equal(calls[2]?.input["Resource"], distributionArn);
  assert.equal(calls[3]?.input["MaxItems"], 1);
  assert.equal(calls[4]?.input["Id"], "oac-demo");
});

async function getProbe(name: string): Promise<Probe> {
  const probeModule = await import("./aws-import-access-probe.js");
  const probe = (probeModule as unknown as Record<string, unknown>)[name];
  assert.equal(typeof probe, "function", `${name} must be exported`);
  return probe as Probe;
}

async function runProbe(
  probe: Probe,
  response: (commandName: string) => unknown
): Promise<Array<{ name: string; input: Record<string, unknown> }>> {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const outcome = await probe({
    async send(command) {
      const value = command as { constructor: { name: string }; input: Record<string, unknown> };
      calls.push({ name: value.constructor.name, input: value.input });
      return response(value.constructor.name);
    }
  });

  assert.equal(outcome, "success");
  return calls;
}

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

test("ELBv2 topology probe는 첫 Load Balancer의 Target Group과 Listener를 읽는다", async () => {
  const probe = await getProbe("probeElbv2Topology");
  const loadBalancerArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/demo/1";
  const calls = await runProbe(probe, (name) =>
    name === "DescribeLoadBalancersCommand"
      ? { LoadBalancers: [{ LoadBalancerArn: loadBalancerArn }] }
      : {}
  );

  assert.deepEqual(calls.map((call) => call.name), [
    "DescribeLoadBalancersCommand",
    "DescribeTargetGroupsCommand",
    "DescribeListenersCommand"
  ]);
  assert.equal(calls[1]?.input["LoadBalancerArn"], loadBalancerArn);
  assert.equal(calls[2]?.input["LoadBalancerArn"], loadBalancerArn);
  assert.equal(calls[0]?.input["PageSize"], 1);
  assert.equal(calls[1]?.input["PageSize"], 1);
  assert.equal(calls[2]?.input["PageSize"], 1);
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
  const calls = await runProbe(probe, (name) =>
    name === "DescribeScalableTargetsCommand"
      ? {
          ScalableTargets: [{
            ResourceId: "service/demo/api",
            ScalableDimension: "ecs:service:DesiredCount",
            ServiceNamespace: "ecs"
          }]
        }
      : {}
  );

  assert.deepEqual(calls.map((call) => call.name), [
    "DescribeScalableTargetsCommand",
    "DescribeScalingPoliciesCommand"
  ]);
  assert.equal(calls[0]?.input["MaxResults"], 1);
  assert.equal(calls[1]?.input["MaxResults"], 1);
  assert.equal(calls[1]?.input["ResourceId"], "service/demo/api");
  assert.equal(calls[1]?.input["ScalableDimension"], "ecs:service:DesiredCount");
  assert.equal(calls[1]?.input["ServiceNamespace"], "ecs");
});

test("CloudFront topology probe는 Distribution과 OAC metadata를 bounded read한다", async () => {
  const probe = await getProbe("probeCloudFrontTopology");
  const calls = await runProbe(probe, (name) =>
    name === "ListOriginAccessControlsCommand"
      ? { OriginAccessControlList: { Items: [{ Id: "oac-demo" }] } }
      : {}
  );

  assert.deepEqual(calls.map((call) => call.name), [
    "ListDistributionsCommand",
    "ListOriginAccessControlsCommand",
    "GetOriginAccessControlCommand"
  ]);
  assert.equal(calls[0]?.input["MaxItems"], 1);
  assert.equal(calls[1]?.input["MaxItems"], 1);
  assert.equal(calls[2]?.input["Id"], "oac-demo");
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

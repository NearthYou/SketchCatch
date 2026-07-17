import assert from "node:assert/strict";
import test from "node:test";
import { isBoardTemplateAvailable, listBoardTemplates } from "./template-library";

const ASG_TEMPLATE_ID = "brainboard-aws-asg-lb-vpc-subnets";
const ASG_NODE_ID = "d75efaba-a405-4bf0-9cf0-929116e2c267";
const LAUNCH_CONFIGURATION_NODE_ID = "cd499b89-a918-4f50-a93a-2b865f961e60";
const SUBNET_A_NODE_ID = "ff98d607-abd3-49b8-bf7f-f5dae753e5c8";
const SUBNET_B_NODE_ID = "af851fdf-0467-46fb-a990-ae069729728c";
const LOAD_BALANCER_NODE_ID = "d67cbec1-5217-44ea-95e8-93c2bae28504";
const EC2_SECURITY_GROUP_NODE_ID = "a514bd55-a14d-45a0-a047-4220529bd4e2";

test("ASG 템플릿은 실제 Launch Configuration·Subnet·Load Balancer 관계를 읽기 쉽게 표시한다", () => {
  const template = listBoardTemplates().find((candidate) => candidate.id === ASG_TEMPLATE_ID);

  assert.ok(template && isBoardTemplateAvailable(template));
  if (!template || !isBoardTemplateAvailable(template)) return;

  const nodeById = new Map(template.diagramJson.nodes.map((node) => [node.id, node]));
  const asg = nodeById.get(ASG_NODE_ID);
  const launchConfiguration = nodeById.get(LAUNCH_CONFIGURATION_NODE_ID);
  const ec2SecurityGroup = nodeById.get(EC2_SECURITY_GROUP_NODE_ID);

  assert.ok(asg);
  assert.equal(asg.label, "Auto Scaling Group");
  assert.match(asg.iconUrl ?? "", /Auto-Scaling/);
  assert.ok(launchConfiguration);
  assert.equal(launchConfiguration.label, "Launch Configuration");
  assert.ok(ec2SecurityGroup);
  assert.equal(ec2SecurityGroup.label, "EC2 Security Group");
  assert.equal(overlaps(asg, ec2SecurityGroup), false);

  assert.deepEqual(
    template.diagramJson.edges
      .filter((edge) => edge.targetNodeId === ASG_NODE_ID)
      .map((edge) => [edge.sourceNodeId, edge.label])
      .sort(([left], [right]) => left.localeCompare(right)),
    [
      [SUBNET_B_NODE_ID, "subnet"],
      [LAUNCH_CONFIGURATION_NODE_ID, "launch configuration"],
      [SUBNET_A_NODE_ID, "subnet"]
    ]
  );
  assert.ok(
    template.diagramJson.edges.some(
      (edge) =>
        edge.sourceNodeId === ASG_NODE_ID &&
        edge.targetNodeId === LOAD_BALANCER_NODE_ID &&
        edge.label === "load balancer"
    )
  );
});

function overlaps(
  left: {
    readonly position: { readonly x: number; readonly y: number };
    readonly size: { readonly width: number; readonly height: number };
  },
  right: {
    readonly position: { readonly x: number; readonly y: number };
    readonly size: { readonly width: number; readonly height: number };
  }
): boolean {
  return (
    left.position.x < right.position.x + right.size.width &&
    left.position.x + left.size.width > right.position.x &&
    left.position.y < right.position.y + right.size.height &&
    left.position.y + left.size.height > right.position.y
  );
}

import type { ArchitectureJson, DiagramJson } from "@sketchcatch/types";
import { convertArchitectureJsonToDiagramJson } from "./workspace-ai-diagram-adapter";

export function getWorkspaceDiagramFixture(name: string | undefined): DiagramJson | undefined {
  if (process.env.NODE_ENV === "production" || name !== "conventions") {
    return undefined;
  }

  return convertArchitectureJsonToDiagramJson(conventionArchitectureJson);
}

const conventionArchitectureJson: ArchitectureJson = {
  nodes: [
    {
      id: "vpc-main",
      type: "VPC",
      label: "Main VPC",
      positionX: 80,
      positionY: 160,
      config: { terraformResourceName: "main" }
    },
    {
      id: "public-subnet",
      type: "SUBNET",
      label: "Public Subnet",
      positionX: 150,
      positionY: 260,
      config: { terraformResourceName: "public", vpcId: "aws_vpc.main.id" }
    },
    {
      id: "app-security-group",
      type: "SECURITY_GROUP",
      label: "App Security Group",
      positionX: 170,
      positionY: 300,
      config: { terraformResourceName: "app", vpcId: "aws_vpc.main.id" }
    },
    {
      id: "client",
      type: "CLOUDFRONT",
      label: "Client Edge",
      positionX: 120,
      positionY: 60,
      config: {}
    },
    {
      id: "middle-bucket",
      type: "S3",
      label: "Middle Bucket",
      positionX: 360,
      positionY: 80,
      config: {}
    },
    {
      id: "api",
      type: "API_GATEWAY_REST_API",
      label: "API Gateway",
      positionX: 600,
      positionY: 60,
      config: {}
    },
    {
      id: "queue",
      type: "SQS_QUEUE",
      label: "Event Queue",
      positionX: 820,
      positionY: 60,
      config: {}
    },
    {
      id: "worker",
      type: "LAMBDA",
      label: "Worker",
      positionX: 1040,
      positionY: 60,
      config: {}
    },
    {
      id: "app-server",
      type: "EC2",
      label: "Application Server",
      positionX: 210,
      positionY: 340,
      config: {
        subnetId: "aws_subnet.public.id",
        vpcSecurityGroupIds: ["aws_security_group.app.id"]
      }
    }
  ],
  edges: [
    { id: "vpc-contains-subnet", sourceId: "vpc-main", targetId: "public-subnet", label: "contains" },
    { id: "subnet-hosts-server", sourceId: "public-subnet", targetId: "app-server", label: "hosts" },
    { id: "client-to-api", sourceId: "client", targetId: "api", label: "HTTPS" },
    { id: "api-to-queue", sourceId: "api", targetId: "queue", label: "event queue" },
    { id: "queue-to-worker", sourceId: "queue", targetId: "worker", label: "Terraform apply" }
  ]
};

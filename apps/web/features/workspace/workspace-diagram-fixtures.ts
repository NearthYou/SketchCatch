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
      id: "cdn-public-entry",
      type: "CLOUDFRONT",
      label: "CDN Public Entry",
      positionX: 650,
      positionY: 180,
      config: {}
    },
    {
      id: "web-assets-bucket",
      type: "S3",
      label: "Web Assets Bucket",
      positionX: 980,
      positionY: 200,
      config: { terraformResourceName: "web_assets" }
    },
    {
      id: "api-gateway",
      type: "API_GATEWAY_REST_API",
      label: "API Gateway",
      positionX: 40,
      positionY: 260,
      config: {}
    },
    {
      id: "lambda-invoke-permission",
      type: "LAMBDA_PERMISSION",
      label: "Lambda Permission Invoke",
      positionX: 300,
      positionY: 500,
      config: { action: "lambda:InvokeFunction", principal: "apigateway.amazonaws.com" }
    },
    {
      id: "lambda-execution-role",
      type: "IAM_ROLE",
      label: "Lambda Execution Role",
      positionX: 300,
      positionY: 120,
      config: { assumeRolePolicy: "policy-json" }
    },
    {
      id: "lambda-execution-policy",
      type: "IAM_POLICY",
      label: "Lambda Execution Policy",
      positionX: 1200,
      positionY: 120,
      config: { policy: "policy-json" }
    },
    {
      id: "lambda-function",
      type: "LAMBDA",
      label: "Lambda Function",
      positionX: 1100,
      positionY: 500,
      config: { handler: "index.handler", runtime: "nodejs20.x" }
    },
    {
      id: "upload-bucket",
      type: "S3",
      label: "Upload Bucket",
      positionX: 1420,
      positionY: 400,
      config: {}
    },
    {
      id: "lambda-log-key",
      type: "KMS_KEY",
      label: "Lambda Log Key",
      positionX: 1510,
      positionY: 120,
      config: { enableKeyRotation: true }
    },
    {
      id: "lambda-log-group",
      type: "CLOUDWATCH_LOG_GROUP",
      label: "Lambda Logs",
      positionX: 1740,
      positionY: 300,
      config: { name: "/aws/lambda/practice-function" }
    },
    {
      id: "lambda-error-alarm",
      type: "CLOUDWATCH_METRIC_ALARM",
      label: "Lambda Error Alarm",
      positionX: 840,
      positionY: 500,
      config: { metricName: "Errors", namespace: "AWS/Lambda" }
    }
  ],
  edges: [
    { id: "cdn-to-assets", sourceId: "cdn-public-entry", targetId: "web-assets-bucket", label: "HTTPS" },
    { id: "api-to-permission", sourceId: "api-gateway", targetId: "lambda-invoke-permission", label: "allows invoke" },
    { id: "permission-to-lambda", sourceId: "lambda-invoke-permission", targetId: "lambda-function", label: "invokes" },
    { id: "role-to-lambda", sourceId: "lambda-execution-role", targetId: "lambda-function", label: "execution role" },
    { id: "policy-to-role", sourceId: "lambda-execution-policy", targetId: "lambda-execution-role", label: "grants log access" },
    { id: "lambda-to-upload", sourceId: "lambda-function", targetId: "upload-bucket", label: "stores files" },
    { id: "kms-to-logs", sourceId: "lambda-log-key", targetId: "lambda-log-group", label: "encrypts logs" },
    { id: "lambda-to-logs", sourceId: "lambda-function", targetId: "lambda-log-group", label: "writes logs" },
    { id: "alarm-to-lambda", sourceId: "lambda-error-alarm", targetId: "lambda-function", label: "monitors errors" }
  ]
};

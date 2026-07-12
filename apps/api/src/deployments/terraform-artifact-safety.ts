import { createHash } from "node:crypto";
import type { DeploymentLiveProfile } from "@sketchcatch/types";
import { getLiveApplySupportedResourceTypes } from "./deployment-plan-summary.js";

const allowedTopLevelBlocks = new Set(["terraform", "provider", "resource", "data", "variable", "output", "locals"]);
const liveApplySupportedDataSourceTypes = new Set([
  "archive_file",
  "aws_ami",
  "aws_eks_cluster_auth",
  "aws_caller_identity",
  "aws_ssm_parameter"
]);
const allowedProviderSources = new Set([
  "hashicorp/aws",
  "registry.terraform.io/hashicorp/aws",
  "hashicorp/archive",
  "registry.terraform.io/hashicorp/archive",
  "hashicorp/kubernetes",
  "registry.terraform.io/hashicorp/kubernetes"
]);
const allowedAwsProviderRegion = "ap-northeast-2";
const allowedAwsProviderAttributes = new Set(["alias", "region"]);
const disallowedTerraformFunctions = new Set([
  "file",
  "filebase64",
  "filebase64sha256",
  "filebase64sha512",
  "filemd5",
  "fileset",
  "filesha1",
  "filesha256",
  "filesha512",
  "pathexpand",
  "templatefile"
]);
const restrictedNestedBlocks = new Set([
  "backend",
  "cloud",
  "connection",
  "dynamic",
  "provisioner",
  "provider_meta"
]);

type HclToken = {
  kind:
    | "identifier"
    | "string"
    | "open"
    | "close"
    | "equals"
    | "newline"
    | "parenOpen";
  value: string;
  line: number;
};

type HclBlock = {
  type: string;
  labels: string[];
  line: number;
};

export type TerraformArtifactSafetyOptions = {
  liveProfile?: DeploymentLiveProfile | undefined;
};

export class TerraformArtifactSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerraformArtifactSafetyError";
  }
}

export function containsArchiveFileDataSource(
  terraformCode: Buffer | Uint8Array | string
): boolean {
  const source = Buffer.isBuffer(terraformCode)
    ? terraformCode.toString("utf8")
    : terraformCode instanceof Uint8Array
      ? Buffer.from(terraformCode).toString("utf8")
      : terraformCode;

  return extractDataSourceBlocks(stripHclComments(source)).some(
    (dataSource) => dataSource.type === "archive_file"
  );
}

export const managedDemoUserDataMarker = "sketchcatch-demo-managed-user-data:v1";
export const managedDemoUserDataHashPrefix =
  "sketchcatch-demo-managed-user-data-sha256:";

export function assertTerraformArtifactIsSafe(
  terraformCode: Buffer | Uint8Array | string,
  options: TerraformArtifactSafetyOptions = {}
): void {
  const code = Buffer.isBuffer(terraformCode)
    ? terraformCode.toString("utf8")
    : terraformCode instanceof Uint8Array
      ? Buffer.from(terraformCode).toString("utf8")
      : terraformCode;
  const tokens = tokenizeHcl(code);
  const stack: HclBlock[] = [];
  const headerTokensByDepth = new Map<number, HclToken[]>();
  const attributeValueDepths = new Set<number>();
  let depth = 0;

  validateProviderSourceAttributes(tokens);
  validateDisallowedTerraformFunctionCalls(tokens);
  validateDisallowedStringInterpolations(tokens);
  validateArchiveDataSourceAttributes(code);
  const liveProfile = options.liveProfile ?? "practice";
  const supportedResourceTypes = getLiveApplySupportedResourceTypes(liveProfile);

  validateDeploymentResourceAttributes(code, liveProfile);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;

    if (token.kind === "identifier" || token.kind === "string") {
      if (attributeValueDepths.has(depth)) {
        continue;
      }

      const headerTokens = headerTokensByDepth.get(depth) ?? [];
      headerTokens.push(token);
      headerTokensByDepth.set(depth, headerTokens);
      continue;
    }

    if (token.kind === "equals") {
      validateRequiredProviderAssignment(tokens, index, depth, stack);
      validateProviderRegionAssignment(tokens, index, depth, stack);
      headerTokensByDepth.set(depth, []);
      attributeValueDepths.add(depth);
      continue;
    }

    if (token.kind === "open") {
      const block = createBlockFromHeader(headerTokensByDepth.get(depth) ?? [], token.line);
      attributeValueDepths.delete(depth);

      if (block) {
        validateBlock(block, stack, supportedResourceTypes);
        stack.push(block);
      }

      headerTokensByDepth.set(depth, []);
      depth += 1;
      headerTokensByDepth.set(depth, []);
      continue;
    }

    if (token.kind === "close") {
      headerTokensByDepth.set(depth, []);
      attributeValueDepths.delete(depth);
      depth = Math.max(0, depth - 1);

      if (stack.length > depth) {
        stack.pop();
      }

      continue;
    }

    if (token.kind === "newline") {
      if (attributeValueDepths.has(depth)) {
        headerTokensByDepth.set(depth, []);
        attributeValueDepths.delete(depth);
      }
    }
  }
}

function validateBlock(
  block: HclBlock,
  stack: HclBlock[],
  supportedResourceTypes: ReadonlySet<string>
): void {
  if (stack.length === 0) {
    validateTopLevelBlock(block, supportedResourceTypes);
    return;
  }

  const parentBlock = stack[stack.length - 1];

  if (parentBlock?.type === "provider") {
    throw new TerraformArtifactSafetyError(
      `Terraform provider nested block "${block.type}" is not allowed before live deployment at line ${block.line}`
    );
  }

  if (restrictedNestedBlocks.has(block.type)) {
    throw new TerraformArtifactSafetyError(
      `Terraform block "${block.type}" is not allowed before live deployment at line ${block.line}`
    );
  }
}

function validateTopLevelBlock(block: HclBlock, supportedResourceTypes: ReadonlySet<string>): void {
  if (!allowedTopLevelBlocks.has(block.type)) {
    throw new TerraformArtifactSafetyError(
      `Terraform top-level block "${block.type}" is not allowed before live deployment at line ${block.line}`
    );
  }

  if (block.type === "provider" && block.labels[0] !== "aws" && block.labels[0] !== "kubernetes") {
    throw new TerraformArtifactSafetyError(
      `Terraform provider "${block.labels[0] ?? ""}" is not allowed before live deployment at line ${block.line}`
    );
  }

  if (block.type === "data") {
    const dataSourceType = block.labels[0];

    if (!dataSourceType || !liveApplySupportedDataSourceTypes.has(dataSourceType)) {
      throw new TerraformArtifactSafetyError(
        `Terraform data source "${dataSourceType ?? ""}" is not allowed before live deployment at line ${block.line}`
      );
    }
  }

  if (block.type === "resource") {
    const resourceType = block.labels[0];

    if (!resourceType || !supportedResourceTypes.has(resourceType)) {
      throw new TerraformArtifactSafetyError(
        `Terraform resource "${resourceType ?? ""}" is not allowed before live deployment at line ${block.line}`
      );
    }
  }
}

function validateRequiredProviderAssignment(
  tokens: HclToken[],
  equalsIndex: number,
  depth: number,
  stack: HclBlock[]
): void {
  if (!isInsideRequiredProviders(stack) || depth !== stack.length) {
    return;
  }

  const providerName = tokens[equalsIndex - 1];

  if (!providerName || providerName.kind === "open" || providerName.kind === "close") {
    return;
  }

  if (
    providerName.value !== "aws" &&
    providerName.value !== "archive" &&
    providerName.value !== "kubernetes" &&
    providerName.value !== "source" &&
    providerName.value !== "version"
  ) {
    throw new TerraformArtifactSafetyError(
      `Terraform required provider "${providerName.value}" is not allowed before live deployment at line ${providerName.line}`
    );
  }
}

function validateProviderRegionAssignment(
  tokens: HclToken[],
  equalsIndex: number,
  depth: number,
  stack: HclBlock[]
): void {
  const currentBlock = stack[stack.length - 1];

  if (
    !currentBlock ||
    currentBlock.type !== "provider" ||
    currentBlock.labels[0] !== "aws" ||
    depth !== stack.length
  ) {
    return;
  }

  const attributeName = tokens[equalsIndex - 1];

  if (!attributeName || attributeName.kind !== "identifier") {
    return;
  }

  if (!allowedAwsProviderAttributes.has(attributeName.value)) {
    throw new TerraformArtifactSafetyError(
      `Terraform AWS provider attribute "${attributeName.value}" is not allowed before live deployment at line ${attributeName.line}`
    );
  }

  if (attributeName.value === "alias") {
    const aliasToken = findNextValueToken(tokens, equalsIndex + 1);

    if (!aliasToken || aliasToken.kind !== "string") {
      throw new TerraformArtifactSafetyError(
        `Terraform AWS provider alias must be a literal string before live deployment at line ${attributeName.line}`
      );
    }

    return;
  }

  const regionToken = findNextValueToken(tokens, equalsIndex + 1);

  if (
    !regionToken ||
    regionToken.kind !== "string" ||
    regionToken.value !== allowedAwsProviderRegion
  ) {
    throw new TerraformArtifactSafetyError(
      `Terraform AWS provider region must be ${allowedAwsProviderRegion} before live deployment at line ${attributeName.line}`
    );
  }
}

function validateProviderSourceAttributes(tokens: HclToken[]): void {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const key = tokens[index]!;
    const equals = tokens[index + 1]!;

    if (
      key.kind === "identifier" &&
      key.value === "source" &&
      equals.kind === "equals"
    ) {
      const value = findNextValueToken(tokens, index + 2);

      if (
        value &&
        value.kind === "string" &&
        !allowedProviderSources.has(value.value)
      ) {
        throw new TerraformArtifactSafetyError(
          `Terraform provider source "${value.value}" is not allowed before live deployment at line ${value.line}`
        );
      }
    }
  }
}

function validateDisallowedTerraformFunctionCalls(tokens: HclToken[]): void {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index]!;

    if (
      token.kind === "identifier" &&
      disallowedTerraformFunctions.has(token.value) &&
      findNextValueToken(tokens, index + 1)?.kind === "parenOpen"
    ) {
      throw new TerraformArtifactSafetyError(
        `Terraform function "${token.value}" is not allowed before live deployment at line ${token.line}`
      );
    }
  }
}

function validateDisallowedStringInterpolations(tokens: HclToken[]): void {
  for (const token of tokens) {
    if (token.kind !== "string" || !token.value.includes("${")) {
      continue;
    }

    for (const functionName of disallowedTerraformFunctions) {
      const pattern = new RegExp(`\\$\\{[^}]*\\b${functionName}\\s*\\(`);

      if (pattern.test(token.value)) {
        throw new TerraformArtifactSafetyError(
          `Terraform function "${functionName}" is not allowed before live deployment at line ${token.line}`
        );
      }
    }
  }
}

function validateArchiveDataSourceAttributes(source: string): void {
  for (const dataSource of extractDataSourceBlocks(stripHclComments(source))) {
    if (dataSource.type !== "archive_file") {
      continue;
    }

    const body = stripHclComments(dataSource.body);
    const outputPath = findLiteralStringAttribute(body, "output_path");
    const sourceContentFilename = findLiteralStringAttribute(
      body,
      "source_content_filename"
    );
    const usesInlineContent = /\bsource_content\s*=\s*"/.test(body);
    const usesFileSystemSource =
      /\b(?:source_file|source_dir)\s*=/.test(body) || /\bsource\s*\{/.test(body);

    if (!usesInlineContent || usesFileSystemSource || !sourceContentFilename) {
      throw new TerraformArtifactSafetyError(
        `Terraform archive_file must use inline source_content before live deployment at line ${dataSource.line}`
      );
    }

    if (!outputPath || !isSafeArchiveOutputPath(outputPath)) {
      throw new TerraformArtifactSafetyError(
        `Terraform archive_file output_path must stay in the Terraform workspace before live deployment at line ${dataSource.line}`
      );
    }
  }
}

type TerraformResourceBlock = {
  type: string;
  name: string;
  body: string;
  line: number;
};

function validateDeploymentResourceAttributes(
  source: string,
  liveProfile: DeploymentLiveProfile
): void {
  for (const resource of extractResourceBlocks(source)) {
    const body = stripHclComments(resource.body);

    if (liveProfile === "demo_web_service") {
      if (resource.type === "aws_autoscaling_group") {
        validateBoundedLiveObservationAutoScalingGroup(resource, body);
      }

      if (resource.type === "aws_autoscaling_policy") {
        validateBoundedLiveObservationAutoScalingPolicy(resource, body);
      }

      if (resource.type === "aws_cloudwatch_metric_alarm") {
        validateBoundedLiveObservationCloudWatchAlarm(resource, body);
      }
    }

    if (resource.type === "aws_instance" && /\buser_data\s*=/.test(body)) {
      validateManagedDemoUserData(body, resource.line, liveProfile, "user_data", "EC2");
    }

    if (resource.type === "aws_instance" && /\buser_data_base64\s*=/.test(body)) {
      validateManagedDemoUserData(body, resource.line, liveProfile, "user_data_base64", "EC2");
    }

    if (resource.type === "aws_launch_template" && /\buser_data\s*=/.test(body)) {
      validateManagedDemoUserData(
        body,
        resource.line,
        liveProfile,
        "user_data",
        "launch template"
      );
    }

    if (resource.type === "aws_launch_template" && /\buser_data_base64\s*=/.test(body)) {
      validateManagedDemoUserData(
        body,
        resource.line,
        liveProfile,
        "user_data_base64",
        "launch template"
      );
    }

    if (
      resource.type === "aws_s3_bucket" &&
      /\bacl\s*=\s*"public-read(?:-write)?"/.test(body)
    ) {
      throw new TerraformArtifactSafetyError(
        `Terraform public S3 bucket ACL is not allowed before live deployment at line ${resource.line}`
      );
    }

    if (resource.type === "aws_security_group") {
      for (const ingress of extractNamedBlocks(body, "ingress")) {
        validatePublicRemoteAccessIngress(ingress.body, resource.line);
      }
    }

    if (
      resource.type === "aws_security_group_rule" &&
      isIngressSecurityGroupRule(body)
    ) {
      validatePublicRemoteAccessIngress(body, resource.line);
    }
  }
}

function validateBoundedLiveObservationAutoScalingGroup(
  resource: TerraformResourceBlock,
  body: string
): void {
  const valid =
    resource.name === "api" &&
    findNumericAttribute(body, "min_size") === 1 &&
    findNumericAttribute(body, "desired_capacity") === 1 &&
    findNumericAttribute(body, "max_size") === 2 &&
    findNumericAttribute(body, "health_check_grace_period") === 120 &&
    findNumericAttribute(body, "default_instance_warmup") === 60 &&
    hasLiteralStringAttribute(body, "health_check_type", "ELB") &&
    /\btarget_group_arns\s*=\s*\[\s*aws_lb_target_group\.api\.arn\s*,?\s*\]/.test(body);

  if (!valid) {
    throw new TerraformArtifactSafetyError(
      `Terraform must use the bounded Live Observation Auto Scaling Group at line ${resource.line}`
    );
  }
}

function validateBoundedLiveObservationAutoScalingPolicy(
  resource: TerraformResourceBlock,
  body: string
): void {
  const stepAdjustments = extractNamedBlocks(body, "step_adjustment");
  const stepAdjustment = stepAdjustments[0]?.body ?? "";
  const valid =
    resource.name === "scale_out" &&
    hasLiteralStringAttribute(body, "policy_type", "StepScaling") &&
    hasLiteralStringAttribute(body, "adjustment_type", "ChangeInCapacity") &&
    hasReferenceAttribute(
      body,
      "autoscaling_group_name",
      "aws_autoscaling_group.api.name"
    ) &&
    findNumericAttribute(body, "cooldown") === 180 &&
    findNumericAttribute(body, "estimated_instance_warmup") === 60 &&
    stepAdjustments.length === 1 &&
    findNumericAttribute(stepAdjustment, "metric_interval_lower_bound") === 0 &&
    findNumericAttribute(stepAdjustment, "scaling_adjustment") === 1;

  if (!valid) {
    throw new TerraformArtifactSafetyError(
      `Terraform must use the bounded Live Observation autoscaling policy at line ${resource.line}`
    );
  }
}

function validateBoundedLiveObservationCloudWatchAlarm(
  resource: TerraformResourceBlock,
  body: string
): void {
  const valid =
    resource.name === "scale_out" &&
    hasLiteralStringAttribute(
      body,
      "comparison_operator",
      "GreaterThanOrEqualToThreshold"
    ) &&
    findNumericAttribute(body, "evaluation_periods") === 1 &&
    findNumericAttribute(body, "datapoints_to_alarm") === 1 &&
    hasLiteralStringAttribute(body, "metric_name", "RequestCountPerTarget") &&
    hasLiteralStringAttribute(body, "namespace", "AWS/ApplicationELB") &&
    findNumericAttribute(body, "period") === 60 &&
    hasLiteralStringAttribute(body, "statistic", "Sum") &&
    findNumericAttribute(body, "threshold") === 60 &&
    hasLiteralStringAttribute(body, "treat_missing_data", "notBreaching") &&
    /\bLoadBalancer\s*=\s*aws_lb\.demo\.arn_suffix\b/.test(body) &&
    /\bTargetGroup\s*=\s*aws_lb_target_group\.api\.arn_suffix\b/.test(body) &&
    /\balarm_actions\s*=\s*\[\s*aws_autoscaling_policy\.scale_out\.arn\s*,?\s*\]/.test(body);

  if (!valid) {
    throw new TerraformArtifactSafetyError(
      `Terraform must use the bounded Live Observation CloudWatch alarm at line ${resource.line}`
    );
  }
}

function hasLiteralStringAttribute(
  body: string,
  attributeName: string,
  expectedValue: string
): boolean {
  const pattern = new RegExp(
    `\\b${escapeRegExp(attributeName)}\\s*=\\s*"${escapeRegExp(expectedValue)}"`
  );
  return pattern.test(body);
}

function findLiteralStringAttribute(body: string, attributeName: string): string | null {
  const pattern = new RegExp(`\\b${escapeRegExp(attributeName)}\\s*=\\s*"([^"]*)"`);
  return pattern.exec(body)?.[1] ?? null;
}

function isSafeArchiveOutputPath(outputPath: string): boolean {
  return (
    (outputPath.startsWith("./") || outputPath.startsWith("${path.module}/")) &&
    !outputPath.split("/").includes("..")
  );
}

function hasReferenceAttribute(
  body: string,
  attributeName: string,
  expectedReference: string
): boolean {
  const pattern = new RegExp(
    `\\b${escapeRegExp(attributeName)}\\s*=\\s*${escapeRegExp(expectedReference)}\\b`
  );
  return pattern.test(body);
}

function validateManagedDemoUserData(
  body: string,
  line: number,
  liveProfile: DeploymentLiveProfile,
  argumentName: "user_data" | "user_data_base64",
  resourceLabel: "EC2" | "launch template"
): void {
  if (liveProfile !== "demo_web_service" && liveProfile !== "demo_web_service_with_rds") {
    throw new TerraformArtifactSafetyError(
      `Terraform ${resourceLabel} ${argumentName} is not allowed for ${liveProfile} live deployment at line ${line}`
    );
  }

  const match = new RegExp(`\\b${argumentName}\\s*=\\s*"([A-Za-z0-9+/=]+)"`).exec(body);

  if (!match?.[1]) {
    throw new TerraformArtifactSafetyError(
      `Terraform ${resourceLabel} ${argumentName} must be a literal managed base64 value before live deployment at line ${line}`
    );
  }

  const decoded = decodeBase64UserData(match[1], line);

  if (!decoded.includes(managedDemoUserDataMarker)) {
    throw new TerraformArtifactSafetyError(
      `Terraform ${resourceLabel} ${argumentName} is missing the SketchCatch managed marker at line ${line}`
    );
  }

  const canonicalDecoded = decoded.replace(/\r\n/g, "\n");
  const hashMatch = new RegExp(
    `^\\s*#\\s*${escapeRegExp(managedDemoUserDataHashPrefix)}([a-f0-9]{64})\\s*$`,
    "m"
  ).exec(canonicalDecoded);

  if (!hashMatch?.[1]) {
    throw new TerraformArtifactSafetyError(
      `Terraform ${resourceLabel} ${argumentName} is missing the SketchCatch managed hash at line ${line}`
    );
  }

  const normalized = canonicalDecoded.replace(hashMatch[0], `# ${managedDemoUserDataHashPrefix}`);
  const actualHash = createHash("sha256").update(normalized).digest("hex");

  if (hashMatch[1] !== actualHash) {
    throw new TerraformArtifactSafetyError(
      `Terraform ${resourceLabel} ${argumentName} managed hash does not match at line ${line}`
    );
  }
}

function decodeBase64UserData(value: string, line: number): string {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    throw new TerraformArtifactSafetyError(
      `Terraform launch template user_data could not be decoded at line ${line}`
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validatePublicRemoteAccessIngress(body: string, line: number): void {
  if (!hasWorldCidr(body) || !includesRemoteAccessPort(body)) {
    return;
  }

  throw new TerraformArtifactSafetyError(
    `Terraform public SSH or RDP ingress is not allowed before live deployment at line ${line}`
  );
}

function isIngressSecurityGroupRule(body: string): boolean {
  return /\btype\s*=\s*"ingress"/.test(body);
}

function hasWorldCidr(body: string): boolean {
  return (
    /\bcidr_blocks\s*=\s*\[[^\]]*"0\.0\.0\.0\/0"/.test(body) ||
    /\bipv6_cidr_blocks\s*=\s*\[[^\]]*"::\/0"/.test(body)
  );
}

function includesRemoteAccessPort(body: string): boolean {
  if (/\bprotocol\s*=\s*"-1"/.test(body)) {
    return true;
  }

  const fromPort = findNumericAttribute(body, "from_port");
  const toPort = findNumericAttribute(body, "to_port");

  if (fromPort === null && toPort === null) {
    return false;
  }

  const startPort = fromPort ?? toPort!;
  const endPort = toPort ?? fromPort!;

  return [22, 3389].some((port) => startPort <= port && port <= endPort);
}

function findNumericAttribute(body: string, attributeName: string): number | null {
  const pattern = new RegExp(`\\b${attributeName}\\s*=\\s*(\\d+)`);
  const match = pattern.exec(body);

  if (!match?.[1]) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function extractResourceBlocks(source: string): TerraformResourceBlock[] {
  const resources: TerraformResourceBlock[] = [];
  const headerPattern = /\bresource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = headerPattern.exec(source)) !== null) {
    const openBraceIndex = match.index + match[0].length - 1;
    const closeBraceIndex = findMatchingCloseBrace(source, openBraceIndex);

    if (closeBraceIndex === -1) {
      continue;
    }

    resources.push({
      type: match[1]!,
      name: match[2]!,
      body: source.slice(openBraceIndex + 1, closeBraceIndex),
      line: countLineAtOffset(source, match.index)
    });
    headerPattern.lastIndex = closeBraceIndex + 1;
  }

  return resources;
}

function extractDataSourceBlocks(source: string): TerraformResourceBlock[] {
  const dataSources: TerraformResourceBlock[] = [];
  const headerPattern = /\bdata\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = headerPattern.exec(source)) !== null) {
    const openBraceIndex = match.index + match[0].length - 1;
    const closeBraceIndex = findMatchingCloseBrace(source, openBraceIndex);

    if (closeBraceIndex === -1) {
      continue;
    }

    dataSources.push({
      type: match[1]!,
      name: match[2]!,
      body: source.slice(openBraceIndex + 1, closeBraceIndex),
      line: countLineAtOffset(source, match.index)
    });
    headerPattern.lastIndex = closeBraceIndex + 1;
  }

  return dataSources;
}

function extractNamedBlocks(source: string, blockName: string): Array<{ body: string }> {
  const blocks: Array<{ body: string }> = [];
  const headerPattern = new RegExp(`\\b${blockName}\\s*\\{`, "g");
  let match: RegExpExecArray | null;

  while ((match = headerPattern.exec(source)) !== null) {
    const openBraceIndex = match.index + match[0].length - 1;
    const closeBraceIndex = findMatchingCloseBrace(source, openBraceIndex);

    if (closeBraceIndex === -1) {
      continue;
    }

    blocks.push({
      body: source.slice(openBraceIndex + 1, closeBraceIndex)
    });
    headerPattern.lastIndex = closeBraceIndex + 1;
  }

  return blocks;
}

function findMatchingCloseBrace(source: string, openBraceIndex: number): number {
  let depth = 0;
  let index = openBraceIndex;

  while (index < source.length) {
    const char = source[index]!;
    const nextChar = source[index + 1];

    if (char === "\"") {
      index = skipQuotedString(source, index);
      continue;
    }

    if (char === "#" || (char === "/" && nextChar === "/")) {
      index = skipLineComment(source, index);
      continue;
    }

    if (char === "/" && nextChar === "*") {
      index = skipBlockComment(source, index, 1).index;
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  return -1;
}

function stripHclComments(source: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;
    const nextChar = source[index + 1];

    if (char === "\"") {
      const nextIndex = skipQuotedString(source, index);
      result += source.slice(index, nextIndex);
      index = nextIndex;
      continue;
    }

    if (char === "#" || (char === "/" && nextChar === "/")) {
      index = skipLineComment(source, index);
      continue;
    }

    if (char === "/" && nextChar === "*") {
      result += " ";
      index = skipBlockComment(source, index, 1).index;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function skipQuotedString(source: string, index: number): number {
  let nextIndex = index + 1;

  while (nextIndex < source.length) {
    const char = source[nextIndex]!;

    if (char === "\\") {
      nextIndex += 2;
      continue;
    }

    if (char === "\"") {
      return nextIndex + 1;
    }

    nextIndex += 1;
  }

  return source.length;
}

function countLineAtOffset(source: string, offset: number): number {
  let line = 1;

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }

  return line;
}

function findNextValueToken(tokens: HclToken[], startIndex: number): HclToken | undefined {
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!token || token.kind === "newline") {
      continue;
    }

    return token;
  }

  return undefined;
}

function isInsideRequiredProviders(stack: HclBlock[]): boolean {
  return (
    stack.length >= 2 &&
    stack[stack.length - 2]?.type === "terraform" &&
    stack[stack.length - 1]?.type === "required_providers"
  );
}

function createBlockFromHeader(headerTokens: HclToken[], fallbackLine: number): HclBlock | null {
  const [typeToken, ...labelTokens] = headerTokens;

  if (!typeToken || typeToken.kind !== "identifier") {
    return null;
  }

  return {
    type: typeToken.value,
    labels: labelTokens.map((token) => token.value),
    line: typeToken.line || fallbackLine
  };
}

function tokenizeHcl(source: string): HclToken[] {
  const tokens: HclToken[] = [];
  let index = 0;
  let line = 1;

  while (index < source.length) {
    const char = source[index]!;
    const nextChar = source[index + 1];

    if (char === "\n") {
      tokens.push({ kind: "newline", value: char, line });
      line += 1;
      index += 1;
      continue;
    }

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "#" || (char === "/" && nextChar === "/")) {
      index = skipLineComment(source, index);
      continue;
    }

    if (char === "/" && nextChar === "*") {
      const skipped = skipBlockComment(source, index, line);
      index = skipped.index;
      line = skipped.line;
      continue;
    }

    if (char === "<" && nextChar === "<") {
      throw new TerraformArtifactSafetyError(
        `Terraform heredoc values are not allowed before live deployment at line ${line}`
      );
    }

    if (char === "\"") {
      const parsed = parseQuotedString(source, index, line);
      tokens.push({
        kind: "string",
        value: parsed.value,
        line
      });
      index = parsed.index;
      line = parsed.line;
      continue;
    }

    if (char === "{") {
      tokens.push({ kind: "open", value: char, line });
      index += 1;
      continue;
    }

    if (char === "}") {
      tokens.push({ kind: "close", value: char, line });
      index += 1;
      continue;
    }

    if (char === "=") {
      tokens.push({ kind: "equals", value: char, line });
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ kind: "parenOpen", value: char, line });
      index += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;

      index += 1;
      while (index < source.length && /[A-Za-z0-9_-]/.test(source[index]!)) {
        index += 1;
      }

      tokens.push({
        kind: "identifier",
        value: source.slice(start, index),
        line
      });
      continue;
    }

    index += 1;
  }

  return tokens;
}

function skipLineComment(source: string, index: number): number {
  let nextIndex = index;

  while (nextIndex < source.length && source[nextIndex] !== "\n") {
    nextIndex += 1;
  }

  return nextIndex;
}

function skipBlockComment(
  source: string,
  index: number,
  line: number
): { index: number; line: number } {
  let nextIndex = index + 2;
  let nextLine = line;

  while (nextIndex < source.length - 1) {
    if (source[nextIndex] === "\n") {
      nextLine += 1;
    }

    if (source[nextIndex] === "*" && source[nextIndex + 1] === "/") {
      return {
        index: nextIndex + 2,
        line: nextLine
      };
    }

    nextIndex += 1;
  }

  return {
    index: source.length,
    line: nextLine
  };
}

function parseQuotedString(
  source: string,
  index: number,
  line: number
): { value: string; index: number; line: number } {
  let nextIndex = index + 1;
  let nextLine = line;
  let value = "";

  while (nextIndex < source.length) {
    const char = source[nextIndex]!;

    if (char === "\n") {
      nextLine += 1;
    }

    if (char === "\\") {
      value += source[nextIndex + 1] ?? "";
      nextIndex += 2;
      continue;
    }

    if (char === "\"") {
      return {
        value,
        index: nextIndex + 1,
        line: nextLine
      };
    }

    value += char;
    nextIndex += 1;
  }

  return {
    value,
    index: source.length,
    line: nextLine
  };
}

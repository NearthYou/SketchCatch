type TerraformResourceBlock = Readonly<{
  body: string;
  line: number;
  name: string;
  type: string;
}>;

export function hasCheckInSigningSecretTerraformContract(terraformCode: string): boolean {
  const resources = listTerraformResourceBlocks(terraformCode);
  const secretVersions = resources.filter(
    (resource) => resource.type === "aws_secretsmanager_secret_version"
  );

  return secretVersions.some((secretVersion) => {
    const secretResourceName = matchTerraformReference(
      secretVersion.body,
      "secret_id",
      "aws_secretsmanager_secret",
      "id"
    );
    const generatedMaterialResourceName = matchTerraformReference(
      secretVersion.body,
      "secret_string",
      "random_password",
      "result"
    );
    if (
      !secretResourceName ||
      !generatedMaterialResourceName ||
      !hasTerraformResource(resources, "aws_secretsmanager_secret", secretResourceName) ||
      !hasTerraformResource(resources, "random_password", generatedMaterialResourceName)
    ) {
      return false;
    }

    return resources
      .filter((resource) => resource.type === "aws_ecs_task_definition")
      .some((taskDefinition) =>
        hasCompleteEcsRuntimeSecretChain(resources, taskDefinition, secretResourceName)
      );
  });
}

function listTerraformResourceBlocks(source: string): TerraformResourceBlock[] {
  const resources: TerraformResourceBlock[] = [];
  const headerPattern = /\bresource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gu;
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

function hasCompleteEcsRuntimeSecretChain(
  resources: readonly TerraformResourceBlock[],
  taskDefinition: TerraformResourceBlock,
  secretResourceName: string
): boolean {
  const executionRoleName = matchTerraformReference(
    taskDefinition.body,
    "execution_role_arn",
    "aws_iam_role",
    "arn"
  );
  if (
    !executionRoleName ||
    !hasTerraformResource(resources, "aws_iam_role", executionRoleName) ||
    !hasTaskSecretMapping(taskDefinition.body, secretResourceName)
  ) {
    return false;
  }

  const hasExactExecutionRolePolicy = resources
    .filter((resource) => resource.type === "aws_iam_role_policy")
    .some((policy) => hasExactSecretReadPolicy(policy.body, executionRoleName, secretResourceName));
  const isTaskUsedByService = resources
    .filter((resource) => resource.type === "aws_ecs_service")
    .some(
      (service) =>
        matchTerraformReference(
          service.body,
          "task_definition",
          "aws_ecs_task_definition",
          "arn"
        ) === taskDefinition.name
    );

  return hasExactExecutionRolePolicy && isTaskUsedByService;
}

function hasTaskSecretMapping(body: string, secretResourceName: string): boolean {
  const normalizedBody = body.replaceAll('\\"', '"');
  const escapedSecretResourceName = escapeRegExpLiteral(secretResourceName);
  return new RegExp(
    String.raw`"name"\s*:\s*"CHECK_IN_SIGNING_SECRET"[^}]{0,500}"valueFrom"\s*:\s*"\$\{aws_secretsmanager_secret\.${escapedSecretResourceName}\.arn\}"`,
    "u"
  ).test(normalizedBody);
}

function hasExactSecretReadPolicy(
  body: string,
  executionRoleName: string,
  secretResourceName: string
): boolean {
  const roleReference = matchTerraformReference(body, "role", "aws_iam_role", "id");
  const policy = parseTerraformJsonStringAttribute(body, "policy");
  if (roleReference !== executionRoleName || !isRecord(policy)) {
    return false;
  }

  const statements = policy["Statement"];
  if (
    !hasExactKeys(policy, ["Statement", "Version"]) ||
    policy["Version"] !== "2012-10-17" ||
    !Array.isArray(statements) ||
    statements.length !== 1 ||
    !isRecord(statements[0])
  ) {
    return false;
  }

  const statement = statements[0];
  return (
    hasExactKeys(statement, ["Action", "Effect", "Resource", "Sid"]) &&
    statement["Sid"] === "ReadCheckInSigningSecret" &&
    statement["Effect"] === "Allow" &&
    Array.isArray(statement["Action"]) &&
    statement["Action"].length === 1 &&
    statement["Action"][0] === "secretsmanager:GetSecretValue" &&
    statement["Resource"] === `\${aws_secretsmanager_secret.${secretResourceName}.arn}`
  );
}

function matchTerraformReference(
  body: string,
  attributeName: string,
  resourceType: string,
  attribute: string
): string | null {
  const pattern = new RegExp(
    String.raw`\b${escapeRegExpLiteral(attributeName)}\s*=\s*${escapeRegExpLiteral(resourceType)}\.([a-zA-Z0-9_-]+)\.${escapeRegExpLiteral(attribute)}\b`,
    "u"
  );
  return pattern.exec(body)?.[1] ?? null;
}

function hasTerraformResource(
  resources: readonly TerraformResourceBlock[],
  resourceType: string,
  resourceName: string
): boolean {
  return resources.some(
    (resource) => resource.type === resourceType && resource.name === resourceName
  );
}

function parseTerraformJsonStringAttribute(body: string, attributeName: string): unknown {
  const pattern = new RegExp(
    String.raw`\b${escapeRegExpLiteral(attributeName)}\s*=\s*"((?:\\.|[^"\\])*)"`,
    "su"
  );
  const encodedValue = pattern.exec(body)?.[1];
  if (!encodedValue) {
    return null;
  }

  try {
    const decodedValue: unknown = JSON.parse(`"${encodedValue}"`);
    return typeof decodedValue === "string" ? JSON.parse(decodedValue) : null;
  } catch {
    return null;
  }
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expectedKeys].sort().join("\0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function findMatchingCloseBrace(source: string, openBraceIndex: number): number {
  let depth = 0;
  let index = openBraceIndex;

  while (index < source.length) {
    const char = source[index]!;
    const nextChar = source[index + 1];

    if (char === '"') {
      index = skipQuotedString(source, index);
      continue;
    }
    if (char === "#" || (char === "/" && nextChar === "/")) {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === "/" && nextChar === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }

  return -1;
}

function skipQuotedString(source: string, index: number): number {
  let nextIndex = index + 1;
  while (nextIndex < source.length) {
    const char = source[nextIndex]!;
    if (char === "\\") {
      nextIndex += 2;
      continue;
    }
    if (char === '"') return nextIndex + 1;
    nextIndex += 1;
  }
  return source.length;
}

function skipLineComment(source: string, index: number): number {
  let nextIndex = index;
  while (nextIndex < source.length && source[nextIndex] !== "\n") nextIndex += 1;
  return nextIndex;
}

function skipBlockComment(source: string, index: number): number {
  const closeIndex = source.indexOf("*/", index + 2);
  return closeIndex === -1 ? source.length : closeIndex + 2;
}

function countLineAtOffset(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") line += 1;
  }
  return line;
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const providerAddress = "registry.terraform.io/hashicorp/aws";
const providerVersion = "6.51.0";
const generatedAt = "2026-06-24T00:00:00.000Z";
const generatedCatalogPath = path.join(
  repoRoot,
  "apps/web/features/parameter-input/catalog.generated.ts"
);
const overrideCatalogPath = path.join(
  repoRoot,
  "apps/web/features/parameter-input/catalog-overrides.ts"
);
const resourceCatalogPath = path.join(repoRoot, "apps/web/features/resource-settings/catalog.ts");
const checkOnly = process.argv.includes("--check");

main();

function main() {
  const terraformBin = process.env.TF_CLI_PATH || process.env.TERRAFORM_BIN || "terraform";
  assertTerraformAvailable(terraformBin);

  const resourceModule = loadTsModule(resourceCatalogPath);
  const overrideModule = loadTsModule(overrideCatalogPath);
  const resourceCatalog = resourceModule.resourceCatalog;
  const overrideCatalog = overrideModule.terraformAwsParameterCatalog;

  if (!Array.isArray(resourceCatalog)) {
    fail("Resource catalog export `resourceCatalog` was not found.");
  }

  if (!overrideCatalog?.resources) {
    fail("Parameter override export `terraformAwsParameterCatalog` was not found.");
  }

  const schema = readAwsProviderSchema(terraformBin);
  const generatedCatalog = buildGeneratedCatalog(resourceCatalog, overrideCatalog, schema);
  const output = renderGeneratedCatalog(generatedCatalog);

  if (checkOnly) {
    const currentOutput = fs.existsSync(generatedCatalogPath)
      ? fs.readFileSync(generatedCatalogPath, "utf8")
      : "";

    if (normalizeLineEndings(currentOutput) !== normalizeLineEndings(output)) {
      fail(
        [
          "Generated catalog is out of date.",
          "Run `npm run catalog:generate` and review the diff."
        ].join("\n")
      );
    }

    console.log("Terraform AWS generated catalog is up to date.");
    return;
  }

  fs.writeFileSync(generatedCatalogPath, output);
  console.log(`Generated ${path.relative(repoRoot, generatedCatalogPath)}`);
}

function assertTerraformAvailable(terraformBin) {
  const result = spawnSync(terraformBin, ["version"], { encoding: "utf8" });

  if (result.error?.code === "ENOENT") {
    fail(
      [
        "Terraform CLI was not found.",
        "Install Terraform, or set TF_CLI_PATH/TERRAFORM_BIN to the Terraform binary path.",
        "This command only reads provider schema and does not require AWS credentials."
      ].join("\n")
    );
  }

  if (result.status !== 0) {
    fail(result.stderr || result.stdout || "Terraform CLI version check failed.");
  }
}

function readAwsProviderSchema(terraformBin) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "sketchcatch-terraform-schema-"));

  try {
    fs.writeFileSync(
      path.join(workdir, "main.tf"),
      [
        "terraform {",
        "  required_providers {",
        "    aws = {",
        '      source = "hashicorp/aws"',
        `      version = "${providerVersion}"`,
        "    }",
        "  }",
        "}",
        "",
        'provider "aws" {',
        '  region = "us-east-1"',
        "  skip_credentials_validation = true",
        "  skip_metadata_api_check = true",
        "  skip_requesting_account_id = true",
        "}",
        ""
      ].join("\n")
    );

    runTerraform(terraformBin, ["init", "-backend=false", "-input=false", "-no-color"], workdir);
    const schemaOutput = runTerraform(terraformBin, ["providers", "schema", "-json"], workdir);
    const parsed = JSON.parse(schemaOutput);
    const providerSchema = parsed.provider_schemas?.[providerAddress];

    if (!providerSchema) {
      fail(`Provider schema for ${providerAddress} was not found in Terraform output.`);
    }

    return providerSchema;
  } finally {
    if (!process.env.KEEP_TERRAFORM_SCHEMA_DIR) {
      fs.rmSync(workdir, { force: true, recursive: true });
    } else {
      console.log(`Kept Terraform schema workdir: ${workdir}`);
    }
  }
}

function runTerraform(terraformBin, args, cwd) {
  const result = spawnSync(terraformBin, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      TF_IN_AUTOMATION: "1"
    },
    maxBuffer: 1024 * 1024 * 200
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    fail(result.stderr || result.stdout || `terraform ${args.join(" ")} failed.`);
  }

  return result.stdout;
}

function buildGeneratedCatalog(resourceCatalog, overrideCatalog, providerSchema) {
  const awsResources = resourceCatalog.filter((item) => item.nodeDefaults.type.startsWith("aws_"));
  const blockTypeByResource = new Map(
    awsResources.map((item) => [
      item.nodeDefaults.type,
      item.nodeDefaults.terraformBlockType === "data" ? "data" : "resource"
    ])
  );
  const catalogTypes = Array.from(new Set(awsResources.map((item) => item.nodeDefaults.type)));
  const catalogTypeSet = new Set(catalogTypes);
  const overrideTypes = Object.keys(overrideCatalog.resources);
  const extraOverrides = overrideTypes.filter((type) => !catalogTypes.includes(type));

  if (extraOverrides.length > 0) {
    fail(
      [
        "Resource catalog and parameter override catalog are not aligned.",
        extraOverrides.length > 0 ? `Extra overrides: ${extraOverrides.join(", ")}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  const errors = [];
  const resources = {};

  for (const resourceType of overrideTypes.filter((type) => catalogTypeSet.has(type))) {
    const terraformBlockType = blockTypeByResource.get(resourceType) ?? "resource";
    const schemaCollection =
      terraformBlockType === "data"
        ? providerSchema.data_source_schemas
        : providerSchema.resource_schemas;
    const resourceSchema = schemaCollection?.[resourceType];

    if (!resourceSchema?.block) {
      errors.push(`${resourceType}: provider schema not found`);
      continue;
    }

    resources[resourceType] = overrideCatalog.resources[resourceType].map((definition) =>
      mergeDefinitionWithSchema(definition, resourceSchema.block, "", `${resourceType}`, errors)
    );
  }

  if (errors.length > 0) {
    fail(["Terraform provider schema validation failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  }

  return {
    provider: "aws",
    generatedAt,
    source: `terraform-provider-aws-schema@${providerVersion}`,
    resources
  };
}

function mergeDefinitionWithSchema(definition, block, parentPath, errorPath, errors) {
  const schemaPath = definition.schemaPath || definition.terraformName;
  const fullSchemaPath = parentPath ? `${parentPath}.${schemaPath}` : schemaPath;
  const schemaEntry = findSchemaEntry(block, fullSchemaPath.split("."));

  if (!schemaEntry) {
    errors.push(`${errorPath}.${definition.name}: schema path \`${fullSchemaPath}\` not found`);
  }

  const schemaValue = schemaEntry?.schema ?? {};
  const providerDescription =
    schemaValue.description || schemaValue.markdown_description || definition.description;
  const required = definition.required;
  const merged = pruneUndefined({
    name: definition.name,
    terraformName: definition.terraformName,
    label: definition.label,
    type: getCatalogType(schemaEntry) ?? definition.type,
    required,
    optional: required ? false : schemaValue.optional ?? definition.optional,
    computed: schemaValue.computed ?? definition.computed,
    core: definition.core,
    sensitive: Boolean(schemaValue.sensitive || definition.sensitive),
    description: definition.description || providerDescription,
    inputKind: definition.inputKind,
    options: definition.options,
    referenceTargetTypes: definition.referenceTargetTypes,
    referenceAttribute: definition.referenceAttribute,
    referenceAttributesByTargetType: definition.referenceAttributesByTargetType,
    placeholder: definition.placeholder
  });

  if (definition.children) {
    merged.children = definition.children.map((child) =>
      mergeDefinitionWithSchema(child, block, fullSchemaPath, `${errorPath}.${definition.name}`, errors)
    );
  }

  return merged;
}

function findSchemaEntry(block, parts) {
  let currentBlock = block;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const isLast = index === parts.length - 1;
    const attribute = currentBlock.attributes?.[part];

    if (attribute) {
      return isLast
        ? { kind: "attribute", schema: attribute }
        : findAttributeTypeEntry(attribute, parts.slice(index + 1));
    }

    const blockType = currentBlock.block_types?.[part];

    if (!blockType) {
      return null;
    }

    if (isLast) {
      return { kind: "block", schema: blockType };
    }

    currentBlock = blockType.block;
  }

  return null;
}

function findAttributeTypeEntry(attribute, parts) {
  let currentType = unwrapCollectionType(attribute.type);

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const isLast = index === parts.length - 1;
    const objectShape = getObjectShape(currentType);

    if (!objectShape || !(part in objectShape)) {
      return null;
    }

    const propertyType = objectShape[part];

    if (isLast) {
      return {
        kind: "attribute",
        schema: {
          computed: attribute.computed,
          optional: attribute.optional,
          required: attribute.required,
          sensitive: attribute.sensitive,
          type: propertyType
        }
      };
    }

    currentType = unwrapCollectionType(propertyType);
  }

  return null;
}

function unwrapCollectionType(terraformType) {
  if (
    Array.isArray(terraformType) &&
    (terraformType[0] === "list" || terraformType[0] === "set" || terraformType[0] === "map")
  ) {
    return terraformType[1];
  }

  return terraformType;
}

function getObjectShape(terraformType) {
  if (Array.isArray(terraformType) && terraformType[0] === "object" && isRecord(terraformType[1])) {
    return terraformType[1];
  }

  return null;
}

function getCatalogType(schemaEntry) {
  if (!schemaEntry) {
    return null;
  }

  if (schemaEntry.kind === "block") {
    return typeFromNestingMode(schemaEntry.schema.nesting_mode);
  }

  return typeFromTerraformType(schemaEntry.schema.type);
}

function typeFromNestingMode(nestingMode) {
  if (nestingMode === "single") {
    return "object";
  }

  if (nestingMode === "set") {
    return "set";
  }

  if (nestingMode === "map") {
    return "map";
  }

  return "list";
}

function typeFromTerraformType(terraformType) {
  if (terraformType === "string") {
    return "string";
  }

  if (terraformType === "number") {
    return "number";
  }

  if (terraformType === "bool") {
    return "boolean";
  }

  if (Array.isArray(terraformType)) {
    const collectionType = terraformType[0];

    if (collectionType === "list" || collectionType === "set" || collectionType === "map") {
      return collectionType;
    }

    if (collectionType === "object") {
      return "object";
    }
  }

  return "string";
}

function renderGeneratedCatalog(catalog) {
  return [
    "// Generated by `npm run catalog:generate`.",
    "// Do not edit manually. Edit catalog-overrides.ts, then regenerate.",
    'import type { ParameterCatalog } from "./catalog-overrides";',
    "",
    `export const terraformAwsParameterCatalog = ${JSON.stringify(catalog, null, 2)} satisfies ParameterCatalog;`,
    "",
    "export const terraformParameterCatalog = terraformAwsParameterCatalog;",
    'export type { ParameterCatalog, ParameterCatalogDefinition } from "./catalog-overrides";',
    ""
  ].join("\n");
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n");
}

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  }).outputText;
  const module = { exports: {} };
  const dirname = path.dirname(filePath);
  const moduleRequire = createRequire(filePath);

  vm.runInNewContext(compiled, {
    __dirname: dirname,
    __filename: filePath,
    exports: module.exports,
    module,
    require: moduleRequire,
    console
  });

  return module.exports;
}

function pruneUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

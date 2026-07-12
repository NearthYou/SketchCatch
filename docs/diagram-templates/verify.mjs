import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(root, "../..");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));

const resourceTypesSource = await readFile(
  path.join(repositoryRoot, "packages/types/src/index.ts"),
  "utf8"
);
const resourceTypesBlock = resourceTypesSource.match(
  /export const RESOURCE_TYPES = \[([\s\S]*?)\] as const;/
);
assert.ok(resourceTypesBlock, "RESOURCE_TYPES declaration was not found");
const supportedResourceTypes = new Set(
  [...resourceTypesBlock[1].matchAll(/"([A-Z0-9_]+)"/g)].map((match) => match[1])
);

const requiredHeadings = [
  "## 적용 조건",
  "## 필수 리소스",
  "## 금지 조건",
  "## 리소스 연결 순서",
  "## 권장 수량",
  "## 프라이빗/퍼블릭 서브넷 배치",
  "## Terraform 필수 파라미터",
  "## 배포 전 검증 조건",
  "## 잘못된 구조 예시"
];

assert.equal(manifest.schemaVersion, "1.0");
assert.equal(manifest.patterns.length, 6, "exactly six verified patterns are required");

const patternIds = new Set();
const documentIds = new Set();

for (const pattern of manifest.patterns) {
  assert.equal(pattern.status, "verified", `${pattern.id}: status must be verified`);
  assert.ok(!patternIds.has(pattern.id), `${pattern.id}: duplicate pattern id`);
  patternIds.add(pattern.id);

  const documentPath = path.join(root, pattern.document);
  const metadataPath = path.join(root, pattern.metadata);
  await stat(documentPath);
  await stat(metadataPath);

  const document = await readFile(documentPath, "utf8");
  assert.match(document, new RegExp(`pattern_id: ${pattern.id}`));
  for (const heading of requiredHeadings) {
    assert.ok(document.includes(heading), `${pattern.id}: missing ${heading}`);
  }
  assert.match(document, /## 근거\s+[\s\S]*https:\/\//, `${pattern.id}: missing source links`);

  for (const resourceType of pattern.requiredResourceTypes) {
    assert.ok(
      supportedResourceTypes.has(resourceType),
      `${pattern.id}: unsupported ResourceType ${resourceType}`
    );
  }

  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  assert.equal(metadata.ContentType, "MD", `${pattern.id}: metadata ContentType`);
  assert.ok(metadata.Title, `${pattern.id}: metadata title is required`);
  assert.ok(metadata.DocumentId, `${pattern.id}: metadata DocumentId is required`);
  assert.ok(!documentIds.has(metadata.DocumentId), `${pattern.id}: duplicate DocumentId`);
  documentIds.add(metadata.DocumentId);
}

const inventory = await readFile(path.join(root, "source-inventory.md"), "utf8");
const repositoryEntries = inventory.match(/^- \[[^\]]+\]\(https:\/\/github\.com\/aws-samples\//gm) ?? [];
assert.equal(repositoryEntries.length, 154, "source inventory must contain all 154 repositories");

console.log(
  `Verified ${manifest.patterns.length} patterns, ${supportedResourceTypes.size} supported resource types, and ${repositoryEntries.length} aws-samples repositories.`
);

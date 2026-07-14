import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const generatorPath = path.join(
  repositoryRoot,
  "scripts/brainboard-capture/generate-source-fixtures.mjs"
);
const configDirectory = path.join(
  repositoryRoot,
  "scripts/brainboard-capture/source-fixture-configs"
);
const sourcesDirectory = path.join(
  repositoryRoot,
  "packages/types/src/brainboard-templates/sources"
);
const subject = await import("./generate-source-fixtures.mjs").catch(() => ({}));

test("targeted config check loads and checks only the requested independent batch", () => {
  const result = spawnSync(
    process.execPath,
    [generatorPath, "--check", "--config", "batch-01-02.mjs"],
    { cwd: repositoryRoot, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Checked 2 deterministic Brainboard source fixtures from batch-01-02\.mjs/u
  );
});

test("generator rejects unknown options instead of silently checking all batches", () => {
  const result = spawnSync(process.execPath, [generatorPath, "--check", "--typo"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown option: --typo/u);
});

test("all 23 generated fixtures are idempotent under the repository Prettier config", async () => {
  const configFileNames = readdirSync(configDirectory)
    .filter((fileName) => /^batch-[0-9-]+\.mjs$/u.test(fileName))
    .sort((left, right) => left.localeCompare(right, "en"));
  const configModules = await Promise.all(
    configFileNames.map(
      (fileName) => import(pathToFileURL(path.join(configDirectory, fileName)).href)
    )
  );
  const fixtures = configModules.flatMap((module) => module.fixtures);

  assert.equal(fixtures.length, 23);
  for (const fixture of fixtures) {
    const sourcePath = path.join(sourcesDirectory, fixture.outputFileName);
    const source = readFileSync(sourcePath, "utf8");
    const prettierConfig = (await resolveConfig(sourcePath)) ?? {};

    assert.equal(
      await format(source, { ...prettierConfig, filepath: sourcePath }),
      source,
      `${fixture.outputFileName} is not idempotent under the repository Prettier config`
    );
  }
});

test("fixture generation rejects tampered raw capture bytes before parsing", () => {
  assert.equal(typeof subject.readVerifiedRawCapture, "function");
  const index = JSON.parse(
    readFileSync(
      path.join(
        repositoryRoot,
        "docs/gg/feat-infrastructure-template/brainboard-capture-index.json"
      ),
      "utf8"
    )
  );
  const entry = index.templates[0];
  const sourcePath = path.join(
    repositoryRoot,
    "docs/gg/feat-infrastructure-template/brainboard-captures",
    entry.file
  );
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "brainboard-fixture-generator-"));
  const temporaryCapturePath = path.join(temporaryDirectory, entry.file);
  try {
    writeFileSync(temporaryCapturePath, readFileSync(sourcePath));
    assert.equal(
      subject.readVerifiedRawCapture(temporaryCapturePath, entry.captureSha256).id,
      entry.id
    );
    writeFileSync(temporaryCapturePath, `${readFileSync(temporaryCapturePath, "utf8")}\n`);
    assert.throws(
      () => subject.readVerifiedRawCapture(temporaryCapturePath, entry.captureSha256),
      /Raw capture SHA-256 mismatch/u
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

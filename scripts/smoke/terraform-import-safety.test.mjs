import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  access,
  mkdtemp as createTemporaryDirectory,
  readFile as readExternalFile,
  readdir,
  rm as removeTemporaryDirectory,
  stat,
  writeFile as writeExternalFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";

import {
  TerraformImportSafetyError,
  assertDisposableFixtureAbsent,
  assertImportOnlyPlan,
  assertNoOpPlan,
  assertSingleAllowlistedUpdatePlan,
  clearTerraformImportSafetyEvidence,
  createDisposableS3FixtureCommand,
  createProtectedTerraformEnvironment,
  createTerraformImportSafetyStagePlan,
  createTerraformImportSafetyEvidence,
  readTerraformImportSafetyEvidencePath,
  evaluateTerraformImportFixturePreflight,
  readTerraformImportSafetyConfig,
  renderTerraformImportFixture,
  renderTerraformImportSafetyUsage,
  runTerraformImportSafetyHarness,
  writeTerraformImportSafetyEvidence
} from "./terraform-import-safety.mjs";

const ACCOUNT_ID = "111122223333";
const REGION = "ap-northeast-2";
const RUN_ID = "reverse-import-001";
const BUCKET = `sketchcatch-import-safety-${RUN_ID}`;

// Build the smallest explicit environment that can pass a read-only preflight.
function buildEnv(overrides = {}) {
  return {
    SKETCHCATCH_TF_IMPORT_RUN_ID: RUN_ID,
    SKETCHCATCH_TF_IMPORT_ACCOUNT_ID: ACCOUNT_ID,
    SKETCHCATCH_TF_IMPORT_ALLOWED_ACCOUNT_IDS: ACCOUNT_ID,
    SKETCHCATCH_TF_IMPORT_REGION: REGION,
    SKETCHCATCH_TF_IMPORT_ALLOWED_REGIONS: REGION,
    ...overrides
  };
}

// Build the exact isolated AWS fixture evidence accepted by the harness.
function buildFixtureEvidence(overrides = {}) {
  return {
    accountId: ACCOUNT_ID,
    locationConstraintPresent: true,
    locationConstraint: REGION,
    objectCountPresent: true,
    objectCount: 0,
    objectListingComplete: true,
    versionListingComplete: true,
    versionCount: 0,
    deleteMarkerCount: 0,
    multipartListingComplete: true,
    multipartUploadCount: 0,
    tagSet: [
      { Key: "SketchCatchHarness", Value: "terraform-import-safety-v1" },
      { Key: "SketchCatchRunId", Value: RUN_ID },
      { Key: "SketchCatchMutable", Value: "before" }
    ],
    ...overrides
  };
}

// Build a Terraform resource change with optional before and after snapshots.
function buildChange({
  actions,
  importing,
  before = {},
  after = {},
  address = "aws_s3_bucket.fixture"
}) {
  return {
    address,
    mode: "managed",
    type: "aws_s3_bucket",
    name: "fixture",
    change: {
      actions,
      before,
      after,
      ...(importing === undefined ? {} : { importing })
    }
  };
}

// Assert a safety error by its stable code instead of its implementation wording.
function assertSafetyError(operation, code) {
  assert.throws(operation, (error) => {
    assert.equal(error instanceof TerraformImportSafetyError, true);
    assert.equal(error.code, code);
    return true;
  });
}

// Add the exact approval needed for a full import-and-update execution test.
function buildExecuteEnv(overrides = {}) {
  return buildEnv({
    SKETCHCATCH_TF_IMPORT_MODE: "execute",
    SKETCHCATCH_TF_IMPORT_MUTATION_APPROVED: "IMPORT_AND_UPDATE_ONE_DISPOSABLE_S3_TAG",
    ...overrides
  });
}

// Add the separate approval needed for a one-time fixture creation test.
function buildCreateFixtureEnv(overrides = {}) {
  return buildEnv({
    SKETCHCATCH_TF_IMPORT_MODE: "create_fixture",
    SKETCHCATCH_TF_IMPORT_FIXTURE_CREATION_APPROVED: "CREATE_ONE_DISPOSABLE_EMPTY_S3_FIXTURE",
    ...overrides
  });
}

// Build the exact initial import plan accepted by the safety contract.
function buildImportPlan() {
  return {
    resource_changes: [buildChange({ actions: ["no-op"], importing: { id: BUCKET } })]
  };
}

// Build the only allowed post-import remote update plan.
function buildAllowlistedUpdatePlan() {
  const before = {
    bucket: BUCKET,
    force_destroy: false,
    tags: { SketchCatchMutable: "before", SketchCatchRunId: RUN_ID },
    tags_all: { SketchCatchMutable: "before", SketchCatchRunId: RUN_ID }
  };
  return {
    resource_changes: [
      buildChange({
        actions: ["update"],
        before,
        after: {
          ...before,
          tags: { ...before.tags, SketchCatchMutable: "after" },
          tags_all: { ...before.tags_all, SketchCatchMutable: "after" }
        }
      })
    ]
  };
}

// Provide deterministic AWS, Terraform, and local-file adapters for orchestration tests.
function createFakeHarnessDependencies(options = {}) {
  const calls = [];
  const writes = [];
  const removals = [];
  let updateApplied = false;
  const workdir = "/safe/tmp/sketchcatch-tf-import-safety-test";

  // Return protected command evidence without contacting AWS or Terraform.
  const commandRunner = async (command, args, commandOptions = {}) => {
    const call = { command, args: [...args], options: commandOptions };
    calls.push(call);
    await options.onCommand?.(call);

    if (command === "terraform" && args[0] === "version") {
      return { exitCode: 0, stdout: JSON.stringify({ terraform_version: "1.6.6" }) };
    }
    if (command === "aws" && args[0] === "--version") return { exitCode: 0, stdout: "" };
    if (command === "aws" && args[0] === "sts") {
      return { exitCode: 0, stdout: JSON.stringify({ Account: ACCOUNT_ID }) };
    }
    if (command === "aws" && args.includes("list-buckets")) {
      return { exitCode: 0, stdout: "[]" };
    }
    if (command === "aws" && args.includes("create-bucket")) {
      if (options.failAt === "fixture_create") throw new Error("fixture create failed");
      return { exitCode: 0, stdout: "{}" };
    }
    if (command === "aws" && args.includes("get-bucket-location")) {
      if (options.failAt === "fixture_verify") throw new Error("fixture verify failed");
      return {
        exitCode: 0,
        stdout: JSON.stringify({ LocationConstraint: REGION })
      };
    }
    if (command === "aws" && args.includes("get-bucket-tagging")) {
      if (options.failAt === "provider_update_verify" && updateApplied) {
        throw new Error("provider update verify failed");
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          TagSet: [
            { Key: "SketchCatchHarness", Value: "terraform-import-safety-v1" },
            { Key: "SketchCatchRunId", Value: RUN_ID },
            { Key: "SketchCatchMutable", Value: updateApplied ? "after" : "before" }
          ]
        })
      };
    }
    if (command === "aws" && args.includes("list-objects-v2")) {
      return { exitCode: 0, stdout: JSON.stringify({ IsTruncated: false, KeyCount: 0 }) };
    }
    if (command === "aws" && args.includes("list-object-versions")) {
      return { exitCode: 0, stdout: JSON.stringify({ IsTruncated: false }) };
    }
    if (command === "aws" && args.includes("list-multipart-uploads")) {
      return { exitCode: 0, stdout: JSON.stringify({ IsTruncated: false }) };
    }
    if (command === "terraform" && args[0] === "init") {
      return { exitCode: 0, stdout: "" };
    }
    if (command === "terraform" && args[0] === "plan") {
      const output = args.find((argument) => argument.startsWith("-out=")) ?? "";
      return {
        exitCode:
          output.includes("import.tfplan") || output.includes("allowlisted-update.tfplan") ? 2 : 0,
        stdout: ""
      };
    }
    if (command === "terraform" && args[0] === "show") {
      const planPath = args.at(-1) ?? "";
      const plan = planPath.includes("import.tfplan")
        ? buildImportPlan()
        : planPath.includes("allowlisted-update.tfplan")
          ? buildAllowlistedUpdatePlan()
          : { resource_changes: [buildChange({ actions: ["no-op"] })] };
      return { exitCode: 0, stdout: JSON.stringify(plan) };
    }
    if (command === "terraform" && args[0] === "apply") {
      const planPath = args.at(-1) ?? "";
      if (planPath.includes("import.tfplan") && options.failAt === "import_apply") {
        throw new Error("import apply failed");
      }
      if (planPath.includes("allowlisted-update.tfplan")) updateApplied = true;
      return { exitCode: 0, stdout: "" };
    }
    throw new Error(`Unexpected protected command: ${command} ${args.join(" ")}`);
  };

  return {
    dependencies: {
      commandRunner,
      temporaryRoot: "/safe/tmp",
      fileSystem: {
        // Keep generated Terraform files in a deterministic fake workspace.
        async mkdtemp() {
          return workdir;
        },
        // Record file contents without creating state or plans on disk.
        async writeFile(path, content, fileOptions) {
          writes.push({ path, content, options: fileOptions });
        },
        // Prove the harness always requests local workspace cleanup.
        async rm(path, removeOptions) {
          removals.push({ path, options: removeOptions });
        }
      }
    },
    calls,
    writes,
    removals,
    workdir
  };
}

test("preflight is the default and derives one exact disposable fixture", () => {
  const config = readTerraformImportSafetyConfig(buildEnv());

  assert.equal(config.mode, "preflight");
  assert.equal(config.fixtureBucketName, BUCKET);
  assert.deepEqual(config.allowedAccountIds, [ACCOUNT_ID]);
  assert.deepEqual(createTerraformImportSafetyStagePlan(), ["tools", "identity", "fixture"]);
});

test("Terraform subprocess environment removes every ambient TF override", () => {
  const protectedEnv = createProtectedTerraformEnvironment(
    {
      PATH: "/safe/bin",
      AWS_PROFILE: "sandbox",
      TF_LOG: "TRACE",
      TF_LOG_CORE: "DEBUG",
      TF_LOG_PROVIDER: "TRACE",
      TF_LOG_PATH: "/outside/terraform.log",
      TF_CLI_ARGS: "-destroy",
      TF_CLI_ARGS_plan: "-refresh=false",
      TF_WORKSPACE: "production",
      TF_DATA_DIR: "/outside/data"
    },
    "/safe/work"
  );

  assert.equal(protectedEnv.PATH, "/safe/bin");
  assert.equal(protectedEnv.AWS_PROFILE, "sandbox");
  assert.equal(protectedEnv.TF_IN_AUTOMATION, "1");
  assert.equal(protectedEnv.TF_INPUT, "0");
  assert.equal(protectedEnv.TF_DATA_DIR, "/safe/work/.terraform-data");
  assert.equal(
    Object.keys(protectedEnv).some((key) => /^TF_LOG/u.test(key)),
    false
  );
  assert.equal(
    Object.keys(protectedEnv).some((key) => /^TF_CLI_ARGS/u.test(key)),
    false
  );
  assert.equal("TF_WORKSPACE" in protectedEnv, false);
});

test("ambient TF_LOG_PATH cannot create a file outside the harness workspace", async () => {
  const externalDirectory = await createTemporaryDirectory(
    join(tmpdir(), "sketchcatch-external-tf-log-")
  );
  const externalLogPath = join(externalDirectory, "terraform.log");
  const fake = createFakeHarnessDependencies({
    async onCommand(call) {
      if (call.command === "terraform" && call.options.env?.TF_LOG_PATH) {
        await writeExternalFile(call.options.env.TF_LOG_PATH, "unsafe ambient log", "utf8");
      }
    }
  });

  try {
    const result = await runTerraformImportSafetyHarness(
      buildEnv({ TF_LOG: "TRACE", TF_LOG_PATH: externalLogPath }),
      fake.dependencies
    );
    assert.equal(result.mode, "preflight");
    await assert.rejects(access(externalLogPath));
  } finally {
    await removeTemporaryDirectory(externalDirectory, { recursive: true, force: true });
  }
});

test("approval validation runs before any command or mutation", async () => {
  for (const env of [
    buildEnv({ SKETCHCATCH_TF_IMPORT_MODE: "execute" }),
    buildEnv({ SKETCHCATCH_TF_IMPORT_MODE: "create_fixture" })
  ]) {
    const fake = createFakeHarnessDependencies();
    await assert.rejects(runTerraformImportSafetyHarness(env, fake.dependencies));
    assert.deepEqual(fake.calls, []);
    assert.deepEqual(fake.writes, []);
    assert.deepEqual(fake.removals, []);
  }
});

test("create_fixture orchestration creates once and verifies without Terraform apply", async () => {
  const fake = createFakeHarnessDependencies();
  const result = await runTerraformImportSafetyHarness(buildCreateFixtureEnv(), fake.dependencies);

  assert.equal(result.fixtureCreated, true);
  assert.equal(result.cloudDestroyPerformed, false);
  assert.equal(
    fake.calls.filter((call) => call.command === "aws" && call.args.includes("create-bucket"))
      .length,
    1
  );
  assert.equal(
    fake.calls.some((call) => call.command === "terraform" && call.args[0] === "apply"),
    false
  );
  assert.equal(
    fake.calls.some((call) => call.args.includes("list-object-versions")),
    true
  );
  assert.equal(
    fake.calls.some((call) => call.args.includes("list-multipart-uploads")),
    true
  );
  const absenceIndex = fake.calls.findIndex((call) => call.args.includes("list-buckets"));
  const createIndex = fake.calls.findIndex((call) => call.args.includes("create-bucket"));
  const verifyIndex = fake.calls.findIndex((call) => call.args.includes("get-bucket-location"));
  assert.equal(absenceIndex < createIndex && createIndex < verifyIndex, true);
  assert.deepEqual(fake.writes, []);
  assert.deepEqual(fake.removals, []);
});

test("fixture 생성 뒤 검증 실패는 이미 생긴 AWS 변경을 안전한 progress로 남긴다", async () => {
  const progress = [];
  const fake = createFakeHarnessDependencies({ failAt: "fixture_verify" });

  await assert.rejects(
    runTerraformImportSafetyHarness(buildCreateFixtureEnv(), {
      ...fake.dependencies,
      onProgress(value) {
        progress.push(value);
      }
    })
  );

  assert.deepEqual(progress.at(-1), {
    mode: "create_fixture",
    mutationPerformed: true,
    mutationStage: "fixture_created",
    fixtureCreated: true
  });
});

test("execute orchestration proves import, one update, final no-op, and local cleanup", async () => {
  const fake = createFakeHarnessDependencies();
  const result = await runTerraformImportSafetyHarness(buildExecuteEnv(), fake.dependencies);
  const terraformCalls = fake.calls.filter((call) => call.command === "terraform");
  const applyCalls = terraformCalls.filter((call) => call.args[0] === "apply");

  assert.equal(result.proof.importedPlanNoOp, true);
  assert.equal(result.proof.allowlistedUpdateCount, 1);
  assert.equal(result.proof.finalPlanNoOp, true);
  assert.equal(result.proof.cloudDestroyPerformed, false);
  assert.equal(applyCalls.length, 2);
  assert.equal(terraformCalls.filter((call) => call.args[0] === "plan").length, 4);
  assert.equal(terraformCalls.filter((call) => call.args[0] === "show").length, 4);
  assert.equal(applyCalls[0].args.at(-1).endsWith("import.tfplan"), true);
  assert.equal(applyCalls[1].args.at(-1).endsWith("allowlisted-update.tfplan"), true);
  assert.equal(fake.writes.length, 2);
  assert.deepEqual(fake.removals, [
    { path: fake.workdir, options: { recursive: true, force: true } }
  ]);
  for (const call of terraformCalls) {
    assert.equal(
      Object.keys(call.options.env ?? {}).some((key) => /^TF_LOG/u.test(key)),
      false
    );
    assert.equal(
      Object.keys(call.options.env ?? {}).some((key) => /^TF_CLI_ARGS/u.test(key)),
      false
    );
    assert.equal("TF_WORKSPACE" in (call.options.env ?? {}), false);
  }
});

test("허용된 tag 변경 뒤 검증 실패도 blocked evidence용 mutation progress를 남긴다", async () => {
  const progress = [];
  const fake = createFakeHarnessDependencies({ failAt: "provider_update_verify" });

  await assert.rejects(
    runTerraformImportSafetyHarness(buildExecuteEnv(), {
      ...fake.dependencies,
      onProgress(value) {
        progress.push(value);
      }
    })
  );

  assert.deepEqual(progress.at(-1), {
    mode: "execute",
    mutationPerformed: true,
    mutationStage: "allowlisted_update_applied",
    fixtureCreated: false
  });
});

test("an import apply failure stops later mutations and still removes local state", async () => {
  const fake = createFakeHarnessDependencies({ failAt: "import_apply" });

  await assert.rejects(runTerraformImportSafetyHarness(buildExecuteEnv(), fake.dependencies));

  const applyCalls = fake.calls.filter(
    (call) => call.command === "terraform" && call.args[0] === "apply"
  );
  assert.equal(applyCalls.length, 1);
  assert.equal(applyCalls[0].args.at(-1).endsWith("import.tfplan"), true);
  assert.equal(
    fake.calls.some((call) =>
      call.args.some((argument) => String(argument).includes("allowlisted-update.tfplan"))
    ),
    false
  );
  assert.deepEqual(fake.removals, [
    { path: fake.workdir, options: { recursive: true, force: true } }
  ]);
});

test("execute mode requires an exact explicit mutation approval", () => {
  assertSafetyError(
    () => readTerraformImportSafetyConfig(buildEnv({ SKETCHCATCH_TF_IMPORT_MODE: "execute" })),
    "mutation_not_approved"
  );

  const config = readTerraformImportSafetyConfig(
    buildEnv({
      SKETCHCATCH_TF_IMPORT_MODE: "execute",
      SKETCHCATCH_TF_IMPORT_MUTATION_APPROVED: "IMPORT_AND_UPDATE_ONE_DISPOSABLE_S3_TAG"
    })
  );
  assert.equal(config.mode, "execute");
});

test("fixture creation uses a different exact approval", () => {
  assertSafetyError(
    () =>
      readTerraformImportSafetyConfig(
        buildEnv({
          SKETCHCATCH_TF_IMPORT_MODE: "create_fixture",
          SKETCHCATCH_TF_IMPORT_FIXTURE_CREATION_APPROVED: "IMPORT_AND_UPDATE_ONE_DISPOSABLE_S3_TAG"
        })
      ),
    "fixture_creation_not_approved"
  );

  const config = readTerraformImportSafetyConfig(
    buildEnv({
      SKETCHCATCH_TF_IMPORT_MODE: "create_fixture",
      SKETCHCATCH_TF_IMPORT_FIXTURE_CREATION_APPROVED: "CREATE_ONE_DISPOSABLE_EMPTY_S3_FIXTURE"
    })
  );
  assert.equal(config.mode, "create_fixture");
  assert.deepEqual(createTerraformImportSafetyStagePlan(config.mode), [
    "tools",
    "identity",
    "fixture_absence",
    "fixture_create",
    "fixture_verify"
  ]);
});

test("fixture creation command creates one atomically tagged private-owner bucket", () => {
  const config = readTerraformImportSafetyConfig(
    buildEnv({
      SKETCHCATCH_TF_IMPORT_MODE: "create_fixture",
      SKETCHCATCH_TF_IMPORT_FIXTURE_CREATION_APPROVED: "CREATE_ONE_DISPOSABLE_EMPTY_S3_FIXTURE"
    })
  );
  const request = createDisposableS3FixtureCommand(config);
  const configuration = JSON.parse(
    request.args[request.args.indexOf("--create-bucket-configuration") + 1]
  );

  assert.equal(request.command, "aws");
  assert.deepEqual(request.args.slice(0, 4), ["s3api", "create-bucket", "--bucket", BUCKET]);
  assert.equal(request.args.includes("BucketOwnerEnforced"), true);
  assert.equal(configuration.LocationConstraint, REGION);
  assert.deepEqual(configuration.Tags, [
    { Key: "SketchCatchHarness", Value: "terraform-import-safety-v1" },
    { Key: "SketchCatchRunId", Value: RUN_ID },
    { Key: "SketchCatchMutable", Value: "before" }
  ]);
  assert.equal(
    request.args.some((argument) => /delete|destroy/iu.test(argument)),
    false
  );
});

test("fixture creation fails closed when the exact bucket already exists", () => {
  assert.deepEqual(assertDisposableFixtureAbsent([]), { absent: true });
  assertSafetyError(() => assertDisposableFixtureAbsent([BUCKET]), "fixture_already_exists");
  assertSafetyError(() => assertDisposableFixtureAbsent(null), "fixture_already_exists");
});

test("account and region must be exact allowlist members", () => {
  assertSafetyError(
    () =>
      readTerraformImportSafetyConfig(
        buildEnv({ SKETCHCATCH_TF_IMPORT_ALLOWED_ACCOUNT_IDS: "999900001111" })
      ),
    "account_not_allowlisted"
  );
  assertSafetyError(
    () =>
      readTerraformImportSafetyConfig(
        buildEnv({ SKETCHCATCH_TF_IMPORT_ALLOWED_REGIONS: "us-east-1" })
      ),
    "region_not_allowlisted"
  );
});

test("the product production account stays denied even when it is allowlisted", () => {
  assertSafetyError(
    () =>
      readTerraformImportSafetyConfig(
        buildEnv({
          SKETCHCATCH_TF_IMPORT_ACCOUNT_ID: "555980271919",
          SKETCHCATCH_TF_IMPORT_ALLOWED_ACCOUNT_IDS: "555980271919"
        })
      ),
    "production_account_denied"
  );
});

test("fixture preflight accepts only the empty exact-tagged run fixture", () => {
  const config = readTerraformImportSafetyConfig(buildEnv());

  assert.deepEqual(evaluateTerraformImportFixturePreflight(config, buildFixtureEvidence()), {
    ready: true,
    accountVerified: true,
    regionVerified: true,
    empty: true
  });
  assertSafetyError(
    () => evaluateTerraformImportFixturePreflight(config, buildFixtureEvidence({ objectCount: 1 })),
    "fixture_not_empty"
  );
  assertSafetyError(
    () =>
      evaluateTerraformImportFixturePreflight(
        config,
        buildFixtureEvidence({
          tagSet: [...buildFixtureEvidence().tagSet, { Key: "Owner", Value: "shared" }]
        })
      ),
    "fixture_tags_not_isolated"
  );
});

test("fixture preflight fails closed when AWS omits location or object inventory evidence", () => {
  const config = readTerraformImportSafetyConfig(buildEnv());

  assertSafetyError(
    () =>
      evaluateTerraformImportFixturePreflight(
        config,
        buildFixtureEvidence({ locationConstraintPresent: false, locationConstraint: undefined })
      ),
    "fixture_location_unavailable"
  );
  assertSafetyError(
    () =>
      evaluateTerraformImportFixturePreflight(
        config,
        buildFixtureEvidence({ objectCountPresent: false, objectCount: undefined })
      ),
    "fixture_object_inventory_unavailable"
  );
  assertSafetyError(
    () =>
      evaluateTerraformImportFixturePreflight(
        config,
        buildFixtureEvidence({ objectListingComplete: false })
      ),
    "fixture_object_inventory_unavailable"
  );
  assertSafetyError(
    () =>
      evaluateTerraformImportFixturePreflight(
        config,
        buildFixtureEvidence({ versionListingComplete: false })
      ),
    "fixture_version_inventory_unavailable"
  );
  assertSafetyError(
    () =>
      evaluateTerraformImportFixturePreflight(
        config,
        buildFixtureEvidence({ multipartListingComplete: false })
      ),
    "fixture_multipart_inventory_unavailable"
  );
  assertSafetyError(
    () =>
      evaluateTerraformImportFixturePreflight(config, buildFixtureEvidence({ versionCount: 1 })),
    "fixture_has_versions"
  );
  assertSafetyError(
    () =>
      evaluateTerraformImportFixturePreflight(
        config,
        buildFixtureEvidence({ deleteMarkerCount: 1 })
      ),
    "fixture_has_versions"
  );
  assertSafetyError(
    () =>
      evaluateTerraformImportFixturePreflight(
        config,
        buildFixtureEvidence({ multipartUploadCount: 1 })
      ),
    "fixture_has_multipart_uploads"
  );
});

test("initial import accepts one no-op import and rejects remote changes", () => {
  assert.deepEqual(
    assertImportOnlyPlan(
      {
        resource_changes: [buildChange({ actions: ["no-op"], importing: { id: BUCKET } })]
      },
      BUCKET
    ),
    { importOnly: true, remoteMutationCount: 0 }
  );

  for (const actions of [["create"], ["update"], ["delete"], ["delete", "create"]]) {
    assert.throws(() =>
      assertImportOnlyPlan(
        { resource_changes: [buildChange({ actions, importing: { id: BUCKET } })] },
        BUCKET
      )
    );
  }
});

test("post-import and final plans must contain no import or mutation", () => {
  assert.deepEqual(assertNoOpPlan({ resource_changes: [buildChange({ actions: ["no-op"] })] }), {
    noOp: true
  });
  assertSafetyError(
    () =>
      assertNoOpPlan({
        resource_changes: [buildChange({ actions: ["no-op"], importing: { id: BUCKET } })]
      }),
    "expected_noop_plan"
  );
  assertSafetyError(
    () => assertNoOpPlan({ resource_changes: [buildChange({ actions: ["update"] })] }),
    "expected_noop_plan"
  );
});

test("one in-place tag transition is the only accepted provider update", () => {
  const before = {
    bucket: BUCKET,
    force_destroy: false,
    tags: { SketchCatchMutable: "before", SketchCatchRunId: RUN_ID },
    tags_all: { SketchCatchMutable: "before", SketchCatchRunId: RUN_ID }
  };
  const after = {
    ...before,
    tags: { ...before.tags, SketchCatchMutable: "after" },
    tags_all: { ...before.tags_all, SketchCatchMutable: "after" }
  };

  assert.deepEqual(
    assertSingleAllowlistedUpdatePlan({
      resource_changes: [buildChange({ actions: ["update"], before, after })]
    }),
    {
      updateCount: 1,
      changedPaths: ["tags.SketchCatchMutable", "tags_all.SketchCatchMutable"]
    }
  );

  assertSafetyError(
    () =>
      assertSingleAllowlistedUpdatePlan({
        resource_changes: [
          buildChange({ actions: ["update"], before, after: { ...after, force_destroy: true } })
        ]
      }),
    "update_field_not_allowlisted"
  );
  assertSafetyError(
    () =>
      assertSingleAllowlistedUpdatePlan({
        resource_changes: [
          buildChange({ actions: ["update"], before, after }),
          buildChange({
            actions: ["update"],
            before,
            after,
            address: "aws_s3_bucket.unexpected"
          })
        ]
      }),
    "update_plan_scope_invalid"
  );
  assertSafetyError(
    () =>
      assertSingleAllowlistedUpdatePlan({
        resource_changes: [
          {
            ...buildChange({ actions: ["update"], before, after }),
            change: {
              ...buildChange({ actions: ["update"], before, after }).change,
              after_unknown: { bucket_domain_name: true }
            }
          }
        ]
      }),
    "update_contains_unknown_values"
  );
});

test("generated Terraform pins account and region and blocks destroy", () => {
  const source = renderTerraformImportFixture(readTerraformImportSafetyConfig(buildEnv()));

  assert.match(source, /allowed_account_ids = \["111122223333"\]/u);
  assert.match(source, /region\s+= "ap-northeast-2"/u);
  assert.match(source, /version = "~> 5\.0"/u);
  assert.doesNotMatch(source, /version = "~> 6\.0"/u);
  assert.match(source, /prevent_destroy = true/u);
  assert.match(source, /force_destroy = false/u);
  assert.match(source, new RegExp(`id = "${BUCKET}"`, "u"));
  assert.doesNotMatch(source, /backend\s+"s3"/u);
});

test("execution contract has no cloud cleanup or destroy command", () => {
  const stages = createTerraformImportSafetyStagePlan("execute");
  const source = readFileSync(
    fileURLToPath(new URL("./terraform-import-safety.mjs", import.meta.url)),
    "utf8"
  );

  assert.deepEqual(stages, [
    "tools",
    "identity",
    "fixture",
    "terraform_init",
    "import_plan",
    "import_apply",
    "imported_noop_plan",
    "allowlisted_update_plan",
    "allowlisted_update_apply",
    "provider_update_verify",
    "final_noop_plan"
  ]);
  assert.equal(
    stages.some((stage) => /destroy|cleanup/u.test(stage)),
    false
  );
  assert.doesNotMatch(source, /terraform["',\s]+destroy/iu);
  assert.doesNotMatch(source, /delete-bucket|remove-object|s3\s+rm/iu);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:stdout|stderr)/u);
});

test("CLI usage states the operator fixture and read-only default", () => {
  const usage = renderTerraformImportSafetyUsage();

  assert.match(usage, /Default mode: preflight \(read-only\)/u);
  assert.match(usage, /Bucket name: sketchcatch-import-safety-<run id>/u);
  assert.match(usage, /never creates or destroys cloud resources/u);
  assert.match(usage, /create_fixture mode creates only the one empty, tagged fixture/u);
  assert.match(usage, /Local Terraform plans and state are removed without printing/u);
  assert.match(usage, /--evidence-output <absolute path>/u);
  assert.match(usage, /SKETCHCATCH_TF_IMPORT_EVIDENCE_PATH/u);
});

test("evidence 출력 경로는 명시한 절대 경로만 허용하고 없으면 기존 동작을 유지한다", () => {
  assert.equal(readTerraformImportSafetyEvidencePath({}, []), null);
  assert.equal(
    readTerraformImportSafetyEvidencePath(
      { SKETCHCATCH_TF_IMPORT_EVIDENCE_PATH: "/tmp/from-env.json" },
      []
    ),
    "/tmp/from-env.json"
  );
  assert.equal(
    readTerraformImportSafetyEvidencePath(
      { SKETCHCATCH_TF_IMPORT_EVIDENCE_PATH: "/tmp/from-env.json" },
      ["--evidence-output", "/tmp/from-cli.json"]
    ),
    "/tmp/from-cli.json"
  );
  assert.equal(
    readTerraformImportSafetyEvidencePath({}, ["--evidence-output=/tmp/from-equals.json"]),
    "/tmp/from-equals.json"
  );
  assertSafetyError(
    () => readTerraformImportSafetyEvidencePath({}, ["--evidence-output", "relative.json"]),
    "invalid_evidence_path"
  );
  assertSafetyError(
    () => readTerraformImportSafetyEvidencePath({}, ["--evidnce-output", "/tmp/typo.json"]),
    "invalid_cli_argument"
  );
});

test("evidence는 현재 CLI 실행과 대조할 수 있는 invocation id를 보존한다", () => {
  const evidence = createTerraformImportSafetyEvidence({
    status: "passed",
    invocationId: "6f27cc6b-9236-4ad1-9e6c-8ef576c9ed3d",
    startedAt: "2026-07-23T08:00:00.000Z",
    mutationPerformed: true,
    mutationStage: "allowlisted_update_applied"
  });

  assert.equal(evidence.invocationId, "6f27cc6b-9236-4ad1-9e6c-8ef576c9ed3d");
  assert.equal(evidence.startedAt, "2026-07-23T08:00:00.000Z");
  assert.equal(evidence.mutationPerformed, true);
  assert.equal(evidence.mutationStage, "allowlisted_update_applied");
});

test("새 실행 전에 이전 성공 evidence를 제거해 실패 뒤 stale pass가 남지 않게 한다", async () => {
  const directory = await createTemporaryDirectory(join(tmpdir(), "sketchcatch-stale-evidence-"));
  const evidencePath = join(directory, "terraform-import-evidence.json");

  try {
    await writeExternalFile(evidencePath, '{"status":"passed","invocationId":"old"}\n');
    await clearTerraformImportSafetyEvidence(evidencePath);
    await assert.rejects(access(evidencePath));
    await assert.rejects(
      clearTerraformImportSafetyEvidence(evidencePath, {
        fileSystem: {
          async rm() {
            throw new Error("permission denied");
          }
        }
      }),
      (error) => {
        assert.equal(error instanceof TerraformImportSafetyError, true);
        assert.equal(error.code, "evidence_prepare_failed");
        return true;
      }
    );
  } finally {
    await removeTemporaryDirectory(directory, { recursive: true, force: true });
  }
});

test("evidence는 임시 파일에서 원자적으로 교체하고 secret과 Terraform state를 저장하지 않는다", async () => {
  const directory = await createTemporaryDirectory(join(tmpdir(), "sketchcatch-evidence-"));
  const evidencePath = join(directory, "terraform-import-evidence.json");

  try {
    await writeTerraformImportSafetyEvidence(evidencePath, {
      kind: "sketchcatch_terraform_import_safety",
      schemaVersion: 1,
      mode: "execute",
      status: "passed",
      mutationPerformed: true,
      fixtureFingerprint: "safe-fingerprint",
      secretAccessKey: "must-not-be-written",
      terraformState: { resources: ["must-not-be-written"] },
      preflight: {
        ready: true,
        accountVerified: true,
        regionVerified: true,
        empty: true,
        rawProviderOutput: "must-not-be-written"
      },
      proof: {
        importRemoteMutationCount: 0,
        importedPlanNoOp: true,
        allowlistedUpdateCount: 1,
        providerUpdateVerified: true,
        finalPlanNoOp: true,
        cloudDestroyPerformed: false,
        statePayload: "must-not-be-written"
      }
    });

    const contents = await readExternalFile(evidencePath, "utf8");
    const saved = JSON.parse(contents);
    assert.equal(saved.status, "passed");
    assert.equal(saved.proof.finalPlanNoOp, true);
    assert.doesNotMatch(
      contents,
      /must-not-be-written|secretAccessKey|terraformState|statePayload/iu
    );
    assert.deepEqual(await readdir(directory), ["terraform-import-evidence.json"]);
    assert.equal((await stat(evidencePath)).mode & 0o777, 0o600);
  } finally {
    await removeTemporaryDirectory(directory, { recursive: true, force: true });
  }
});

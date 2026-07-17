import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createTerraformApplyArgs,
  createTerraformDestroyPlanArgs,
  createTerraformPlanArgs,
  runTerraformInit,
  type TerraformOutputLine
} from "./terraform-runner.js";

test("Plan, destroy Plan, and Apply commands never use Terraform -target", () => {
  const commands = [
    createTerraformPlanArgs("tfplan"),
    createTerraformDestroyPlanArgs("tfplan"),
    createTerraformApplyArgs("tfplan")
  ];

  for (const command of commands) {
    assert.equal(command.some((argument) => argument === "-target" || argument.startsWith("-target=")), false);
  }
});

test("runTerraformInit emits complete output lines before the command exits", async () => {
  const workdir = await mkdtemp(join(tmpdir(), "sketchcatch-terraform-runner-"));

  try {
    await writeFile(
      join(workdir, "init"),
      [
        'process.stdout.write("first line\\npartial");',
        "setTimeout(() => {",
        '  process.stdout.write(" line\\nlast line");',
        '  process.stderr.write("warning line\\n");',
        "}, 50);"
      ].join("\n"),
      "utf8"
    );

    const outputLines: TerraformOutputLine[] = [];
    let commandSettled = false;
    let resolveFirstLine: (() => void) | undefined;
    const firstLine = new Promise<void>((resolve) => {
      resolveFirstLine = resolve;
    });
    const command = runTerraformInit(workdir, {
      env: {
        TF_PLUGIN_CACHE_DIR: join(workdir, "plugin-cache")
      },
      terraformBinary: process.execPath,
      onOutputLine: async (output) => {
        outputLines.push(output);
        resolveFirstLine?.();
        resolveFirstLine = undefined;
      }
    }).finally(() => {
      commandSettled = true;
    });

    await firstLine;
    assert.equal(commandSettled, false);

    const result = await command;

    assert.equal(result.exitCode, 0);
    assert.deepEqual(outputLines, [
      { line: "first line", stream: "stdout" },
      { line: "partial line", stream: "stdout" },
      { line: "warning line", stream: "stderr" },
      { line: "last line", stream: "stdout" }
    ]);
  } finally {
    await rm(workdir, { force: true, recursive: true });
  }
});

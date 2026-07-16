import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTerraformApplyArgs,
  createTerraformDestroyPlanArgs,
  createTerraformPlanArgs
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

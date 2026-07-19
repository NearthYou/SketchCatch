import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AWS_IMPORT_READERS,
  createAwsImportReadPolicyDocument,
  getAwsImportPolicyFingerprint
} from "./aws-import-access-catalog.js";

test("import catalog produces one read-only policy and shared probe plan", () => {
  const catalogActions = AWS_IMPORT_READERS.flatMap((reader) => reader.actions);
  const normalizedActions = [...new Set(catalogActions)].sort();
  const policy = createAwsImportReadPolicyDocument();

  assert.equal(policy.Statement.length, 1);
  assert.deepEqual([...policy.Statement[0]!.Action].sort(), normalizedActions);
  assert.equal(policy.Statement[0]!.Effect, "Allow");
  assert.equal(policy.Statement[0]!.Resource, "*");
  assert(
    catalogActions.every((action) => /^(?:Describe|Get|GET|List|Search)/u.test(action.split(":")[1] ?? ""))
  );
  assert.doesNotMatch(
    JSON.stringify(policy),
    /Create|Update|Put|Delete|Attach|Detach|PassRole/u
  );
});

test("import policy fingerprint addresses the exact deterministic document", () => {
  const policy = createAwsImportReadPolicyDocument();
  const expected = createHash("sha256").update(JSON.stringify(policy)).digest("hex");

  assert.equal(getAwsImportPolicyFingerprint(), expected);
  assert.match(expected, /^[a-f0-9]{64}$/u);
  assert.equal(getAwsImportPolicyFingerprint(), getAwsImportPolicyFingerprint());
});

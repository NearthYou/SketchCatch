import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AWS_IMPORT_READERS,
  createAwsImportReadPolicyDocument,
  getAwsImportPolicyFingerprint
} from "./aws-import-access-catalog.js";

test("import catalog produces the read-only policy Task 4 gateway and probes will share", () => {
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

test("EventBridge import reader는 Rule과 Target을 읽는 최소 권한만 요청한다", () => {
  const reader = AWS_IMPORT_READERS.find((candidate) => candidate.serviceKey === "eventbridge");

  assert.equal(reader?.displayName, "EventBridge");
  assert.equal(reader?.tier, "expanded");
  assert.deepEqual(reader?.actions, ["events:ListRules", "events:ListTargetsByRule"]);
  assert.doesNotMatch(JSON.stringify(reader), /Create|Put|Delete|Tag/u);
});

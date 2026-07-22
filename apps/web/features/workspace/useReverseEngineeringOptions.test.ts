import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as reverseEngineeringOptions from "./useReverseEngineeringOptions";

type ReverseEngineeringOptionsWithSearchParamResolver = typeof reverseEngineeringOptions & {
  readonly getReverseEngineeringAwsConnectionIdSearchParam?: (
    values: readonly string[]
  ) => string;
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const hookSource = readFileSync(join(currentDir, "useReverseEngineeringOptions.ts"), "utf8");

test("Settings 복귀의 단일 AWS 연결 ID를 hook 초기 선택으로 보존한다", () => {
  const resolver = (
    reverseEngineeringOptions as ReverseEngineeringOptionsWithSearchParamResolver
  ).getReverseEngineeringAwsConnectionIdSearchParam;

  assert.equal(typeof resolver, "function");
  if (!resolver) {
    assert.fail("AWS connection search-param resolver is missing");
  }

  assert.equal(resolver(["pending-connection"]), "pending-connection");
  assert.equal(resolver(["failed-connection"]), "failed-connection");
  assert.equal(resolver([]), "");
  assert.equal(resolver(["pending-connection", "verified-connection"]), "");
  assert.match(hookSource, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(
    hookSource,
    /getReverseEngineeringAwsConnectionIdSearchParam\(\s*searchParams\.getAll\("awsConnectionId"\)\s*\)/
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceClientPath = join(currentDir, "AiWorkspaceClient.tsx");

test("workspace shows draft assumptions so operating conditions have visible feedback", () => {
	const workspaceClientSource = readFileSync(workspaceClientPath, "utf8");

	assert.match(workspaceClientSource, /운영 조건 반영/);
	assert.match(workspaceClientSource, /draft\.metadata\.assumptions\.map/);
});

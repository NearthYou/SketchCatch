import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const thumbnailSource = readFileSync(
  join(currentDir, "../../components/dashboard/project-architecture-thumbnail.tsx"),
  "utf8"
);

test("project architecture thumbnail renders area node border dash arrays", () => {
  assert.match(thumbnailSource, /borderDasharray: string \| undefined/);
  assert.match(thumbnailSource, /strokeDasharray=\{node\.borderDasharray\}/);
  assert.match(thumbnailSource, /getNodeDisplayBorderStyle/);
  assert.match(thumbnailSource, /getThumbnailNodeBorderDasharray/);
});

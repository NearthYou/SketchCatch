import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function readWorkspaceFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}

test("project detail separates source repository, project settings, and Board actions", () => {
  const source = readWorkspaceFile("features/dashboard/project-detail-client.tsx");

  assert.match(source, /\/repository`}/);
  assert.match(source, />\s*소스 저장소\s*</);
  assert.match(source, /\/settings`}/);
  assert.match(source, />\s*프로젝트 설정\s*</);
  assert.match(source, /Architecture Board 열기/);
});

test("legacy GitHub settings URL redirects to the project source repository page", () => {
  const source = readWorkspaceFile("app/dashboard/projects/[projectId]/settings/page.tsx");

  assert.match(source, /searchParams/);
  assert.match(source, /tab === "github"/);
  assert.match(
    source,
    /redirect\(`\/dashboard\/projects\/\$\{encodeURIComponent\(projectId\)\}\/repository`\)/
  );
});

test("dashboard shell labels the repository route as source repository", () => {
  const source = readWorkspaceFile("components/dashboard/dashboard-shell.tsx");

  assert.match(source, /pathname\.endsWith\("\/repository"\)\s*\?\s*"소스 저장소"/);
});

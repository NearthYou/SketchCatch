import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const productEntrySource = readFileSync(
  fileURLToPath(new URL("./product-entry.tsx", import.meta.url)),
  "utf8"
);
const productSectionsSource = readFileSync(
  fileURLToPath(new URL("./landing-product-sections.tsx", import.meta.url)),
  "utf8"
);

test("landing navigation and entry actions use the Korean login-first flow", () => {
  for (const label of ["작업 흐름", "통합 작업 공간", "기존 환경 가져오기", "배포 방식"]) {
    assert.match(productEntrySource, new RegExp(label));
  }

  assert.doesNotMatch(productEntrySource, /제품 둘러보기/);
  assert.doesNotMatch(productEntrySource, /href="\/signup"/);
  assert.doesNotMatch(productSectionsSource, /href="\/signup"/);
  assert.match(productEntrySource, /href="\/login"[\s\S]*설계 시작/);
  assert.match(productSectionsSource, /href="\/login"[\s\S]*새 프로젝트 시작하기/);
});

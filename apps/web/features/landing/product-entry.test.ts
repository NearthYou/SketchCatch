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
  for (const label of ["서비스 흐름", "설계", "인프라 분석", "배포"]) {
    assert.match(productEntrySource, new RegExp(label));
  }

  assert.doesNotMatch(productEntrySource, /제품 둘러보기/);
  assert.doesNotMatch(productEntrySource, /href="\/signup"/);
  assert.doesNotMatch(productSectionsSource, /href="\/signup"/);
  assert.match(productEntrySource, /href="\/login"[\s\S]*설계 시작/);
  assert.match(productSectionsSource, /href="\/login"[\s\S]*새 프로젝트 시작하기/);
  assert.doesNotMatch(productEntrySource, /Product preview|Built from the SketchCatch product flow/);
  assert.match(productEntrySource, /Terraform 기반 멀티 클라우드 IaC 운영 서비스/);
  assert.match(productEntrySource, /© 2026 SketchCatch\. All rights reserved\./);
  assert.match(productEntrySource, /aria-label="푸터 메뉴"/);
});

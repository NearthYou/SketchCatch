import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mypageSource = readAppFile("mypage/page.tsx");

test("mypage route renders a blank screen", () => {
  assert.match(mypageSource, /export default function MyPage\(\)/);
  assert.match(mypageSource, /return null/);
  assert.doesNotMatch(mypageSource, /DashboardShell/);
  assert.doesNotMatch(mypageSource, /MypageClient|MyPageClient/);
  assert.doesNotMatch(mypageSource, /홈 화면|My Page|Home/);
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const clientSource = readAppFile("../../app/observe/[publicId]/observe-client.tsx");
const pageSource = readAppFile("../../app/observe/[publicId]/page.tsx");
const stylesSource = readAppFile("../../app/observe/[publicId]/observe.module.css");

test("public observe route bootstraps by path id and never renders a credential", () => {
  assert.match(pageSource, /params: Promise<\{ publicId: string \}>/);
  assert.match(pageSource, /<ObserveClient publicId=\{publicId\}/);
  assert.match(clientSource, /createClient: createLiveObservationAudienceClient/);
  assert.match(clientSource, /session\.activate\(publicId\)/);
  assert.doesNotMatch(clientSource, /capability|credential|collector|targetUrl|trafficUrl/);
});

test("public observe page shows concise ready, success, failure, expiry and rate-limit states", () => {
  assert.match(clientSource, /"ready"/);
  assert.match(clientSource, /"success"/);
  assert.match(clientSource, /"error"/);
  assert.match(clientSource, /"expired"/);
  assert.match(clientSource, /"rate_limited"/);
  assert.match(clientSource, /"요청 보내기"/);
  assert.match(clientSource, /"다시 연결"/);
  assert.match(clientSource, /"다시 요청"/);
  assert.doesNotMatch(clientSource, /시뮬레이션|데모|mock/i);
});

test("public observe page delegates lifecycle and retries to the single-flight session controller", () => {
  assert.match(clientSource, /createLiveObservationAudienceSession/);
  assert.match(clientSource, /session\.activate\(publicId\)/);
  assert.match(clientSource, /session\.reconnect\(\)/);
  assert.match(clientSource, /session\.request\(\)/);
  assert.match(clientSource, /bootstrapReady/);
  assert.doesNotMatch(clientSource, /activeRef/);
});

test("public observe page has explicit desktop, mobile and reduced-motion contracts", () => {
  assert.match(stylesSource, /\.panel\s*\{/);
  assert.match(stylesSource, /@media \(max-width: 520px\)/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(stylesSource, /min-height:\s*100dvh/);
});

function readAppFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

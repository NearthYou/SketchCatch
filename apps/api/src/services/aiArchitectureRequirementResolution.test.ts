import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveArchitectureRequirement } from "./aiArchitectureRequirementResolution.js";

test("an explicit no-upload answer does not enable upload sizing or storage defaults", () => {
  for (const prompt of [
    "정적 웹사이트입니다. 파일 업로드 기능은 없음 (텍스트만)입니다.",
    "Static website. File upload: none."
  ]) {
    const result = resolveArchitectureRequirement({ prompt });
    assert.equal(result.operatingProfile.uploadProfile, "none", prompt);
    assert.equal(result.requirementFacts.includes("file_upload"), false, prompt);
    assert.notEqual(result.servicePurpose, "file_upload_service", prompt);
  }
});

test("explicit upload requirements retain the selected upload profile", () => {
  for (const [prompt, expected] of [
    ["프로필 이미지 업로드 웹서비스입니다.", "image"],
    ["동영상과 문서 파일 업로드 웹서비스입니다.", "mixed"],
    ["대용량 파일 업로드 웹서비스입니다.", "large"],
    ["file upload: image upload only\nwebsite size: 10MB-100MB", "image"]
  ] as const) {
    const result = resolveArchitectureRequirement({ prompt });
    assert.equal(result.operatingProfile.uploadProfile, expected, prompt);
    assert.equal(result.requirementFacts.includes("file_upload"), true, prompt);
  }
});

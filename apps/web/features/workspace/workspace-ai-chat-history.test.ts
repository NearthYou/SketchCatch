import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLatestUserRequirementPrompt,
  createLatestUserRequirementPromptExcluding
} from "./workspace-ai-chat-history";

test("createLatestUserRequirementPrompt uses only the newest user command", () => {
  const prompt = createLatestUserRequirementPrompt([
    { role: "assistant", content: "질문: 어떤 서비스를 만들까요?" },
    { role: "user", content: "로그인 있는 작은 웹서비스가 필요해" },
    { role: "assistant", content: "초안을 만들었습니다." },
    { role: "user", content: "데이터베이스랑 s3만 있는 다이어그램 그려줘" }
  ]);

  assert.equal(prompt, "데이터베이스랑 s3만 있는 다이어그램 그려줘");
});

test("createLatestUserRequirementPromptExcluding skips no-addition answers", () => {
  const prompt = createLatestUserRequirementPromptExcluding(
    [
      { role: "user", content: "로그인 있는 작은 웹서비스가 필요해" },
      { role: "assistant", content: "어떤 리소스를 추가할까요?" },
      { role: "user", content: "데이터베이스랑 s3만 있는 다이어그램 그려줘" },
      { role: "user", content: "추가 안 함" }
    ],
    "추가 안 함"
  );

  assert.equal(prompt, "데이터베이스랑 s3만 있는 다이어그램 그려줘");
});

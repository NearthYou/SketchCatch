import assert from "node:assert/strict";
import test from "node:test";
import { resolveArchitectureTechnologyStackCategory } from "./architecture-technology-stack.js";

test("frontend technology names map to existing architecture answer categories", () => {
  const scenarios = [
    ["리액트로 할게", "frontend_spa"],
    ["Svelte 쓸 거야", "frontend_spa"],
    ["Next.js로 만들었어", "frontend_ssr"],
    ["Remix 사용", "frontend_ssr"],
    ["Flutter로 개발", "frontend_mobile"],
    ["React Native 썼어", "frontend_mobile"],
    ["바닐라 자바스크립트", "frontend_static"]
  ] as const;

  for (const [answer, expected] of scenarios) {
    assert.equal(resolveArchitectureTechnologyStackCategory("frontend", answer), expected);
  }
});

test("backend technology names map to existing architecture answer categories", () => {
  const scenarios = [
    ["FastAPI 썼어", "backend_simple_api"],
    ["Express로 만들었어", "backend_simple_api"],
    ["스프링부트 사용", "backend_complex"],
    ["Ruby on Rails야", "backend_complex"],
    ["ASP.NET Core", "backend_complex"],
    ["Spring Cloud 마이크로서비스", "backend_microservices"]
  ] as const;

  for (const [answer, expected] of scenarios) {
    assert.equal(resolveArchitectureTechnologyStackCategory("backend", answer), expected);
  }
});

test("ambiguous database technology does not invent a size choice", () => {
  assert.equal(resolveArchitectureTechnologyStackCategory("database", "PostgreSQL 쓸게"), null);
});
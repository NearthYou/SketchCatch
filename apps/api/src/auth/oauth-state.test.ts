import { test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  clearOAuthStateCookie,
  createOAuthState,
  readOAuthStateCookie,
  setOAuthStateCookie
} from "./oauth-state.js";

test("createOAuthState returns unique URL-safe random values", () => {
  const firstState = createOAuthState();
  const secondState = createOAuthState();

  assert.notEqual(firstState, secondState);
  assert.match(firstState, /^[A-Za-z0-9_-]+$/);
  assert.ok(firstState.length >= 32);
});

test("setOAuthStateCookie writes provider and state with secure cookie attributes", () => {
  const reply = createFakeReply();

  setOAuthStateCookie(reply, {
    provider: "naver",
    state: "state-token"
  });

  const cookie = reply.getSetCookieHeader();

  assert.match(cookie, /^sketchcatch_oauth_state=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\/api\/auth\/oauth/);
  assert.match(cookie, /Max-Age=300/);
});

test("readOAuthStateCookie parses a valid state cookie", () => {
  const reply = createFakeReply();

  setOAuthStateCookie(reply, {
    provider: "naver",
    state: "state-token"
  });

  const request = createRequestWithCookie(reply.getSetCookieHeader());

  assert.deepEqual(readOAuthStateCookie(request), {
    provider: "naver",
    state: "state-token"
  });
});

test("readOAuthStateCookie returns null for invalid state cookie values", () => {
  assert.equal(
    readOAuthStateCookie(
      createRequestWithCookie(
        `sketchcatch_oauth_state=${encodeURIComponent(JSON.stringify({ provider: "unknown", state: "x" }))}`
      )
    ),
    null
  );
  assert.equal(
    readOAuthStateCookie(createRequestWithCookie("sketchcatch_oauth_state=not-json")),
    null
  );
  assert.equal(readOAuthStateCookie(createRequestWithCookie("other=value")), null);
});

test("clearOAuthStateCookie expires the state cookie", () => {
  const reply = createFakeReply();

  clearOAuthStateCookie(reply);

  const cookie = reply.getSetCookieHeader();

  assert.match(cookie, /^sketchcatch_oauth_state=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Path=\/api\/auth\/oauth/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
});

test("clearOAuthStateCookie preserves existing Set-Cookie headers", () => {
  const reply = createFakeReply();

  reply.header("set-cookie", ["sketchcatch_refresh_token=value", "sketchcatch_csrf_token=value"]);
  clearOAuthStateCookie(reply);

  const cookies = reply.getSetCookieHeaders();

  assert.equal(cookies.length, 3);
  assert.equal(cookies[0], "sketchcatch_refresh_token=value");
  assert.equal(cookies[1], "sketchcatch_csrf_token=value");
  assert.match(cookies[2] ?? "", /^sketchcatch_oauth_state=/);
  assert.match(cookies[2] ?? "", /Max-Age=0/);
});

function createFakeReply(): FastifyReply & {
  getSetCookieHeader: () => string;
  getSetCookieHeaders: () => string[];
} {
  let setCookieHeader: string | string[] | undefined;

  return {
    getSetCookieHeader: () => {
      if (!setCookieHeader) {
        assert.fail("Expected Set-Cookie header");
      }

      return Array.isArray(setCookieHeader) ? (setCookieHeader.at(-1) ?? "") : setCookieHeader;
    },
    getSetCookieHeaders: () => {
      if (!setCookieHeader) {
        assert.fail("Expected Set-Cookie header");
      }

      return Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    },
    getHeader: (name: string) => {
      if (name.toLowerCase() !== "set-cookie") {
        return undefined;
      }

      return setCookieHeader;
    },
    header: (_name: string, value: string | string[]) => {
      setCookieHeader = value;
      return undefined;
    }
  } as unknown as FastifyReply & {
    getSetCookieHeader: () => string;
    getSetCookieHeaders: () => string[];
  };
}

function createRequestWithCookie(setCookieHeader: string): FastifyRequest {
  return {
    headers: {
      cookie: setCookieHeader.split(";")[0] ?? ""
    }
  } as FastifyRequest;
}

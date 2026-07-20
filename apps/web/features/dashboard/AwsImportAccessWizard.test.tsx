import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import type { AwsImportAccessState } from "@sketchcatch/types";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiClientError } from "../../lib/api-client";

const cssLoaderSource = `export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return { format: "module", shortCircuit: true, source: "export default {};" };
  }
  return nextLoad(url, context);
}`;

register(`data:text/javascript,${encodeURIComponent(cssLoaderSource)}`, import.meta.url);
Object.assign(globalThis, { React });

/** gg: 렌더링 테스트에 내부 AWS 필드가 없는 safe state만 제공합니다. */
function state(overrides: Partial<AwsImportAccessState> = {}): AwsImportAccessState {
  return {
    connectionId: "connection-1",
    status: "update_required",
    nextAction: "preview_policy",
    cleanupAvailable: true,
    coreReady: false,
    limitedServiceLabels: [],
    lastCheckedAt: null,
    operationId: null,
    safeSummary: "가져오기 권한을 확인해 주세요.",
    ...overrides
  };
}

test("wizard error messages hide raw AWS details and request diagnostics", async () => {
  const { getAwsImportAccessErrorMessage } = await import("./AwsImportAccessWizard");
  const error = new ApiClientError(
    500,
    {
      error: "internal_server_error",
      message:
        "AWS 확인 실패 arn:aws:iam::123456789012:role/Hidden RequestId req-provider-secret"
    },
    {
      method: "POST",
      path: "/api/aws/connections/connection-1/import-access/policy",
      requestId: "req-http-secret"
    }
  );

  const message = getAwsImportAccessErrorMessage(
    error,
    "AWS 가져오기 권한 요청을 처리하지 못했습니다."
  );

  assert.equal(message, "AWS 가져오기 권한 요청을 처리하지 못했습니다.");
  assert.doesNotMatch(message, /arn:aws|RequestId|req-provider|req-http|POST|\/api\//iu);
});

test("wizard preserves the existing connection and hides provider internals", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const unsafeExtra = {
    providerError:
      "AccessDenied arn:aws:iam::123456789012:role/X PolicyDocument TemplateBody RequestId abc logical id"
  };
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: { ...state(), ...unsafeExtra } as AwsImportAccessState,
      onCommand() {},
      onContinue() {}
    })
  );

  assert.match(html, /기존 AWS 연결과 배포 권한은 그대로 유지됩니다/u);
  assert.match(html, /처음 만든 AWS 연결 Stack/u);
  assert.match(html, /기존 Terraform 배포 권한/u);
  assert.doesNotMatch(
    html,
    /AccessDenied|arn:aws|PolicyDocument|TemplateBody|RequestId|logical id/iu
  );
});

test("manager approval reload offers both a fresh link and a state check", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state({
        status: "manager_approval_required",
        nextAction: "check_manager"
      }),
      onCommand() {},
      onContinue() {}
    })
  );

  assert.match(html, /Manager 준비 확인/u);
  assert.match(html, /AWS Console 다시 열기/u);
});

test("check_required cleanup is shown only for a persisted access row", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  // gg: status가 같아도 API의 persisted marker만 바꿔 렌더링 경계를 비교합니다.
  const render = (cleanupAvailable: boolean) => renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state({
        status: "check_required",
        nextAction: "prepare_manager",
        cleanupAvailable
      }),
      onCommand() {}
    })
  );

  assert.doesNotMatch(render(false), />가져오기 권한 정리<\/button>/u);
  assert.match(render(true), />가져오기 권한 정리<\/button>/u);
});

test("policy approval requires a visible confirmation before apply", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const reloaded = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state({
        status: "policy_approval_required",
        nextAction: "apply_policy"
      }),
      onCommand() {},
      onContinue() {}
    })
  );
  const previewed = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      hasPolicyApproval: true,
      state: state({
        status: "policy_approval_required",
        nextAction: "apply_policy"
      }),
      onCommand() {},
      onContinue() {}
    })
  );

  assert.match(reloaded, /권한 변경 내용 확인/u);
  assert.doesNotMatch(reloaded, /확인한 권한 적용/u);
  assert.match(previewed, /가져오기 권한 변경을 적용할까요/u);
  assert.match(previewed, /확인한 권한 적용/u);
});

test("Console fallback links open safely without rendering their raw URL", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const signedUrl = "https://console.example.invalid/path?signature=do-not-render";
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      consoleUrl: signedUrl,
      canCopyManagerTemplate: true,
      state: state({
        status: "manager_approval_required",
        nextAction: "check_manager"
      }),
      onCommand() {},
      onContinue() {}
    })
  );

  assert.match(html, /target="_blank"/u);
  assert.match(html, /rel="noreferrer"/u);
  assert.match(html, /AWS Console 열기/u);
  assert.match(html, /Manager 업데이트 링크 복사/u);
  assert.match(html, /Manager의 업데이트를 선택한 뒤 복사한 업데이트 링크를 붙여 넣어 주세요/u);
  assert.equal(html.includes(`>${signedUrl}<`), false);
  assert.doesNotMatch(html, /<pre[\s>]/u);
});

test("Reverse return is shown only for ready or explicit limited continuation", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const updateHtml = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state(),
      onCommand() {},
      onContinue() {}
    })
  );
  const readyHtml = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state({ status: "ready", nextAction: null, coreReady: true }),
      onCommand() {},
      onContinue() {}
    })
  );
  const limitedHtml = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state({
        status: "limited",
        nextAction: "check_reads",
        coreReady: true,
        limitedServiceLabels: ["IAM"]
      }),
      onCommand() {},
      onContinue() {}
    })
  );

  assert.doesNotMatch(updateHtml, /같은 연결로 가져오기|제한된 정보로 계속 가져오기/u);
  assert.match(readyHtml, /같은 연결로 가져오기/u);
  assert.match(limitedHtml, /제한된 정보로 계속 가져오기/u);
  assert.match(limitedHtml, /IAM/u);
});

test("policy preview never applies automatically and apply requires the same in-memory approval", async () => {
  const { runAwsImportAccessCommand } = await import("./AwsImportAccessWizard");
  const calls: string[] = [];
  const api = {
    async prepareManager() { throw new Error("unexpected"); },
    async checkManager() { throw new Error("unexpected"); },
    async previewPolicy() {
      calls.push("preview");
      return {
        connectionId: "connection-1",
        operationId: "operation-1",
        approvalId: "approval-1",
        state: state({ status: "policy_approval_required", nextAction: "preview_policy" }),
        nextAction: "preview_policy" as const
      };
    },
    async applyPolicy(input: {
      connectionId: string;
      approvalId: string;
      operationId: string;
    }) {
      calls.push(`apply:${input.approvalId}:${input.operationId}`);
      return {
        connectionId: input.connectionId,
        operationId: input.operationId,
        state: state({ status: "policy_working", nextAction: "check_reads" }),
        nextAction: "check_reads" as const
      };
    },
    async checkReads() { throw new Error("unexpected"); },
    async prepareCleanup() { throw new Error("unexpected"); },
    async checkCleanup() { throw new Error("unexpected"); }
  };

  const preview = await runAwsImportAccessCommand({
    api,
    approval: null,
    command: "preview_policy",
    connectionId: "connection-1"
  });

  assert.deepEqual(calls, ["preview"]);
  assert.deepEqual(preview.approval, {
    approvalId: "approval-1",
    operationId: "operation-1"
  });

  await runAwsImportAccessCommand({
    api,
    approval: preview.approval,
    command: "apply_policy",
    connectionId: "connection-1"
  });
  assert.deepEqual(calls, ["preview", "apply:approval-1:operation-1"]);

  await assert.rejects(
    () => runAwsImportAccessCommand({
      api,
      approval: null,
      command: "apply_policy",
      connectionId: "connection-1"
    }),
    /권한 변경 내용을 다시 확인해 주세요/u
  );
});

test("failed prepare refreshes the same connection and reveals persisted cleanup without reload", async () => {
  const {
    AwsImportAccessWizardView,
    runAwsImportAccessCommand,
    runAwsImportAccessCommandWithFailureRefresh
  } = await import("./AwsImportAccessWizard");
  let visibleState = state({
    status: "check_required",
    nextAction: "prepare_manager",
    cleanupAvailable: false
  });
  const persistedState = state({
    status: "check_required",
    nextAction: "prepare_manager",
    cleanupAvailable: true
  });
  let providerState = visibleState;
  let commandCalls = 0;
  const refreshedConnectionIds: string[] = [];
  const api = {
    async prepareManager() {
      commandCalls += 1;
      providerState = persistedState;
      throw new Error("provider raw failure");
    },
    async checkManager() { throw new Error("unexpected"); },
    async previewPolicy() { throw new Error("unexpected"); },
    async applyPolicy() { throw new Error("unexpected"); },
    async checkReads() { throw new Error("unexpected"); },
    async prepareCleanup() { throw new Error("unexpected"); },
    async checkCleanup() { throw new Error("unexpected"); }
  };

  await assert.rejects(
    () => runAwsImportAccessCommandWithFailureRefresh({
      connectionId: "connection-1",
      execute: () => runAwsImportAccessCommand({
        api,
        approval: null,
        command: "prepare_manager",
        connectionId: "connection-1"
      }),
      async refreshState(connectionId: string) {
        refreshedConnectionIds.push(connectionId);
        visibleState = providerState;
      }
    }),
    /provider raw failure/u
  );

  assert.equal(commandCalls, 1);
  assert.deepEqual(refreshedConnectionIds, ["connection-1"]);
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: visibleState,
      onCommand() {}
    })
  );
  assert.match(html, />가져오기 권한 정리<\/button>/u);
});

test("cleanup Stack states offer Console opening and a separate completion check", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state({
        status: "cleanup_policy_required",
        nextAction: "delete_policy_stack"
      }),
      onCommand() {},
      onContinue() {}
    })
  );

  assert.match(html, /AWS에서 가져오기 권한 정리/u);
  assert.match(html, /정리 상태 확인/u);
});

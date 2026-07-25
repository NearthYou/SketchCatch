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

/** gg: 화면 테스트에는 public DTO에 있는 안전한 구조 분석 상태만 제공합니다. */
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
    safeSummary: "내부 목록은 기본 화면에 보이지 않아야 합니다.",
    ...overrides
  };
}

/** gg: 버튼 수를 세어 한 상태에서 서로 다른 다음 행동이 겹치지 않게 확인합니다. */
function buttonCount(html: string): number {
  return (html.match(/<button\b/gu) ?? []).length;
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
    "AWS 구조 분석 설정을 처리하지 못했습니다."
  );

  assert.equal(message, "AWS 구조 분석 설정을 처리하지 못했습니다.");
  assert.doesNotMatch(message, /arn:aws|RequestId|req-provider|req-http|POST|\/api\//iu);
});

test("기본 패널은 AWS 구조 분석 상태와 다음 행동 하나만 보여준다", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const unsafeExtra = {
    providerError:
      "AccessDenied arn:aws:iam::123456789012:role/X PolicyDocument TemplateBody RequestId abc",
    managerStackName: "do-not-render"
  };
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: {
        ...state({
          limitedServiceLabels: ["IAM", "CloudWatch"]
        }),
        ...unsafeExtra
      } as AwsImportAccessState,
      onCommand() {}
    })
  );

  assert.match(html, /AWS 구조 분석/u);
  assert.match(html, /설정 필요/u);
  assert.match(html, />설정 내용 확인<\/button>/u);
  assert.equal(buttonCount(html), 1);
  assert.doesNotMatch(
    html,
    /가져오기|Manager|Stack|Policy|Role|arn:aws|AccessDenied|IAM|CloudWatch|내부 목록/iu
  );
});

test("화면에서 요청을 실행하는 동안에는 spinner와 상태만 보여준다", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      consoleUrl: "https://console.example.invalid/should-not-render",
      isBusy: true,
      state: state({
        status: "checking_reads",
        nextAction: "check_reads"
      }),
      onCommand() {}
    })
  );

  assert.match(html, /처리 중/u);
  assert.match(html, /상태를 확인하고 있습니다/u);
  assert.equal(buttonCount(html), 0);
  assert.doesNotMatch(html, /AWS Console 열기|should-not-render/u);
});

test("구조 분석 설정 확인은 AWS 연결 해제 상태와 구분해 보여준다", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state({
        status: "cleanup_required",
        nextAction: "check_cleanup",
        cleanupAvailable: true
      }),
      onCommand() {}
    })
  );

  assert.match(html, /구조 분석 설정 확인 필요/u);
  assert.match(html, /AWS 연결은 그대로 유지됩니다/u);
  assert.match(html, />설정 상태 확인<\/button>/u);
  assert.doesNotMatch(html, /해제 확인 필요|해제 상태 확인/u);
  assert.equal(buttonCount(html), 1);
});

test("설정 적용은 미리 확인한 뒤에만 보이고 행동은 하나만 남긴다", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const beforeApproval = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state({
        status: "policy_approval_required",
        nextAction: "apply_policy"
      }),
      onCommand() {}
    })
  );
  const afterApproval = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      hasPolicyApproval: true,
      state: state({
        status: "policy_approval_required",
        nextAction: "apply_policy"
      }),
      onCommand() {}
    })
  );

  assert.match(beforeApproval, />설정 내용 확인<\/button>/u);
  assert.doesNotMatch(beforeApproval, />설정 적용<\/button>/u);
  assert.match(afterApproval, /구조 분석에 필요한 설정을 적용할까요/u);
  assert.match(afterApproval, />설정 적용<\/button>/u);
  assert.equal(buttonCount(afterApproval), 1);
});

test("AWS Console 링크와 실제 다음 행동 하나만 함께 보여준다", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const signedUrl = "https://console.example.invalid/path?signature=do-not-render";
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      consoleUrl: signedUrl,
      state: state({
        status: "manager_approval_required",
        nextAction: "check_manager"
      }),
      onCommand() {}
    })
  );

  assert.match(html, /target="_blank"/u);
  assert.match(html, /rel="noreferrer"/u);
  assert.match(html, /AWS Console 열기/u);
  assert.match(html, />설정 완료 후 확인<\/button>/u);
  assert.equal(buttonCount(html), 1);
  assert.equal(html.includes(`>${signedUrl}<`), false);
  assert.doesNotMatch(html, /Manager|Stack|Policy/iu);
});

test("설정 링크가 필요한 경우에도 내부 이름 없이 행동 하나만 보여준다", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const setupUrl = "https://private.example.invalid/template?signature=do-not-render";
  const beforeCopy = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      consoleUrl: "https://console.example.invalid/path",
      setupTemplateUrl: setupUrl,
      state: state({
        status: "manager_approval_required",
        nextAction: "check_manager"
      }),
      onCommand() {},
      onCopySetupTemplate() {}
    })
  );
  const afterCopy = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      consoleUrl: "https://console.example.invalid/path",
      setupLinkCopied: true,
      setupTemplateUrl: setupUrl,
      state: state({
        status: "manager_approval_required",
        nextAction: "check_manager"
      }),
      onCommand() {},
      onCopySetupTemplate() {}
    })
  );

  assert.match(beforeCopy, />설정 링크 복사<\/button>/u);
  assert.equal(buttonCount(beforeCopy), 1);
  assert.equal(beforeCopy.includes(`>${setupUrl}<`), false);
  assert.match(afterCopy, />설정 완료 후 확인<\/button>/u);
  assert.equal(buttonCount(afterCopy), 1);
  assert.doesNotMatch(`${beforeCopy}${afterCopy}`, /Manager|Stack|Policy/iu);
});

test("정리 상태는 구조 분석 설정 정리 행동 하나만 보여준다", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state({
        status: "cleanup_policy_required",
        nextAction: "delete_policy_stack"
      }),
      onCommand() {}
    })
  );

  assert.match(html, /구조 분석 설정 정리/u);
  assert.equal(buttonCount(html), 1);
  assert.doesNotMatch(html, /권한 상태 확인|가져오기|Manager|Stack|Policy/iu);
});

test("다시 확인이 필요한 구조 분석 설정은 정리 행동을 우선 보여준다", async () => {
  const { AwsImportAccessWizardView } = await import("./AwsImportAccessWizard");
  const html = renderToStaticMarkup(
    createElement(AwsImportAccessWizardView, {
      connectionStatus: "verified",
      state: state({
        status: "retry_required",
        nextAction: "check_reads",
        cleanupAvailable: true
      }),
      onCommand() {}
    })
  );

  assert.match(html, />구조 분석 설정 정리<\/button>/u);
  assert.doesNotMatch(html, />상태 다시 확인<\/button>/u);
  assert.equal(buttonCount(html), 1);
});

test("Reverse Engineering 복귀는 준비된 상태에서만 간결하게 보여 준다", async () => {
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

  assert.doesNotMatch(updateHtml, /구조 분석 계속|제한된 정보로 계속/u);
  assert.match(readyHtml, />구조 분석 계속<\/button>/u);
  assert.match(limitedHtml, />제한된 정보로 계속<\/button>/u);
  assert.equal(buttonCount(readyHtml), 1);
  assert.equal(buttonCount(limitedHtml), 1);
});

test("준비된 연결은 복귀 목적이 없으면 구조 분석 관리 카드를 숨긴다", async () => {
  const { shouldRenderAwsStructureAnalysisCard } = await import("./AwsImportAccessWizard");

  assert.equal(
    shouldRenderAwsStructureAnalysisCard({
      hasContinueAction: false,
      state: state({
        status: "ready",
        nextAction: null,
        coreReady: true,
        cleanupAvailable: false
      })
    }),
    false
  );
  assert.equal(
    shouldRenderAwsStructureAnalysisCard({
      hasContinueAction: false,
      state: state({
        status: "limited",
        nextAction: "check_reads",
        coreReady: true,
        cleanupAvailable: false
      })
    }),
    false
  );
  assert.equal(
    shouldRenderAwsStructureAnalysisCard({
      hasContinueAction: true,
      state: state({
        status: "ready",
        nextAction: null,
        coreReady: true,
        cleanupAvailable: false
      })
    }),
    true
  );
  assert.equal(
    shouldRenderAwsStructureAnalysisCard({
      hasContinueAction: false,
      state: state({ status: "update_required", nextAction: "preview_policy" })
    }),
    true
  );
});

test("구조 분석 설정은 같은 메모리 승인 없이는 적용되지 않는다", async () => {
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
    /설정 내용을 다시 확인해 주세요/u
  );
});

test("복구 경로는 기존 API 준비 명령을 그대로 사용한다", async () => {
  const { runAwsImportAccessCommand } = await import("./AwsImportAccessWizard");
  const calls: string[] = [];
  const api = {
    async prepareManager(connectionId: string) {
      calls.push(connectionId);
      return {
        connectionId,
        operationId: "operation-1",
        state: state({ status: "manager_approval_required", nextAction: "check_manager" }),
        nextAction: "check_manager" as const
      };
    },
    async checkManager() { throw new Error("unexpected"); },
    async previewPolicy() { throw new Error("unexpected"); },
    async applyPolicy() { throw new Error("unexpected"); },
    async checkReads() { throw new Error("unexpected"); },
    async prepareCleanup() { throw new Error("unexpected"); },
    async checkCleanup() { throw new Error("unexpected"); }
  };

  await runAwsImportAccessCommand({
    api,
    approval: null,
    command: "prepare_manager",
    connectionId: "connection-1"
  });

  assert.deepEqual(calls, ["connection-1"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { AiTerraformErrorExplanationResult, TerraformDiagnostic } from "@sketchcatch/types";
import * as terraformAi from "./workspace-terraform-ai";

const api = terraformAi as unknown as {
  createWorkspaceTerraformFingerprint?: (
    files: readonly { readonly fileName: string; readonly terraformCode: string }[]
  ) => string;
  readStoredTerraformIssueAnalyses?: (
    storage: Pick<Storage, "getItem">,
    projectId: string
  ) => readonly {
    readonly diagnosticKey: string;
    readonly explanation: AiTerraformErrorExplanationResult;
    readonly terraformFingerprint: string;
  }[];
  resolveTerraformIssueCode?: (input: {
    readonly combinedTerraformCode: string;
    readonly diagnostic: TerraformDiagnostic;
    readonly files: readonly { readonly fileName: string; readonly terraformCode: string }[];
  }) => string;
  storeTerraformIssueAnalyses?: (
    storage: Pick<Storage, "removeItem" | "setItem">,
    projectId: string,
    analyses: readonly {
      readonly diagnosticKey: string;
      readonly explanation: AiTerraformErrorExplanationResult;
      readonly terraformFingerprint: string;
    }[]
  ) => void;
};

test("오류 분석은 진단이 가리키는 파일의 코드와 전체 Terraform fingerprint를 사용한다", () => {
  assert.equal(typeof api.resolveTerraformIssueCode, "function");
  assert.equal(typeof api.createWorkspaceTerraformFingerprint, "function");

  const files = [
    { fileName: "main.tf", terraformCode: "resource \"aws_vpc\" \"main\" {}" },
    { fileName: "outputs.tf", terraformCode: "output \"vpc_id\" { value = \"aws_vpc.main.id\" }" }
  ];
  const fingerprint = api.createWorkspaceTerraformFingerprint?.(files);

  assert.equal(
    api.resolveTerraformIssueCode?.({
      combinedTerraformCode: "combined",
      diagnostic: {
        message: "quoted reference",
        severity: "error",
        sourceFileName: "outputs.tf"
      },
      files
    }),
    files[1]?.terraformCode
  );
  assert.equal(fingerprint, api.createWorkspaceTerraformFingerprint?.([...files].reverse()));
  assert.notEqual(
    fingerprint,
    api.createWorkspaceTerraformFingerprint?.([
      files[0]!,
      { ...files[1]!, terraformCode: "output \"vpc_id\" { value = aws_vpc.main.id }" }
    ])
  );
});

test("프로젝트별 오류 분석 결과를 저장하고 손상된 payload는 폐기한다", () => {
  assert.equal(typeof api.storeTerraformIssueAnalyses, "function");
  assert.equal(typeof api.readStoredTerraformIssueAnalyses, "function");

  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  };
  const explanation = {
    category: "syntax",
    consensusRecommendation: "quote를 제거하세요.",
    likelyCause: "reference가 문자열입니다.",
    nextActions: ["quote 제거"],
    rawMessage: "quoted reference",
    severity: "high",
    stage: "validate",
    summary: "Terraform reference 오류",
    wellArchitectedGuidance: []
  } as AiTerraformErrorExplanationResult;

  api.storeTerraformIssueAnalyses?.(storage, "project-1", [
    { diagnosticKey: "diagnostic-1", explanation, terraformFingerprint: "fp-1" }
  ]);
  assert.deepEqual(api.readStoredTerraformIssueAnalyses?.(storage, "project-1"), [
    { diagnosticKey: "diagnostic-1", explanation, terraformFingerprint: "fp-1" }
  ]);

  const key = [...values.keys()][0];
  assert.ok(key);
  values.set(key, JSON.stringify([{ diagnosticKey: 1 }]));
  assert.deepEqual(api.readStoredTerraformIssueAnalyses?.(storage, "project-1"), []);

  values.set(
    key,
    JSON.stringify([
      {
        diagnosticKey: "diagnostic-1",
        explanation: { ...explanation, nextActions: [1] },
        terraformFingerprint: "fp-1"
      }
    ])
  );
  assert.deepEqual(api.readStoredTerraformIssueAnalyses?.(storage, "project-1"), []);
});

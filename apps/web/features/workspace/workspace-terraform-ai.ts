import type { TerraformDiagnostic } from "@sketchcatch/types";
import type { TerraformIssueRecord } from "./terraform-issues-state";

export type TerraformIssueAiRequest = {
  readonly id: number;
  readonly issue: TerraformIssueRecord;
};

export type TerraformSafeFixApplyRequest = {
  readonly id: number;
  readonly diagnostic: TerraformDiagnostic;
};

export type TerraformSafeFixApplyResult = {
  readonly requestId: number;
  readonly applied: boolean;
  readonly message: string;
};


import type { TerraformSyncFileInput } from "@sketchcatch/types";
import { parseTerraformFiles } from "./terraform-panel-utils";

export type LiveObservationTerraformUpdateResult = {
  readonly address: string;
  readonly fileName: string;
  readonly files: readonly TerraformSyncFileInput[];
  readonly nextMaxCapacity: number;
  readonly previousMaxCapacity: number;
};

export class LiveObservationTerraformUpdateError extends Error {
  constructor(
    readonly code: "manual_review_required" | "target_count",
    message: string
  ) {
    super(message);
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "LiveObservationTerraformUpdateError"
    });
  }
}

export function incrementLiveObservationEcsMaxCapacity(
  files: readonly TerraformSyncFileInput[]
): LiveObservationTerraformUpdateResult {
  const virtualFiles = files.map(({ fileName, terraformCode }) => ({
    code: terraformCode,
    fileName
  }));
  const targets = parseTerraformFiles(virtualFiles).filter(
    (block) =>
      block.blockType === "resource" &&
      block.terraformType === "aws_appautoscaling_target"
  );

  if (targets.length !== 1) {
    throw new LiveObservationTerraformUpdateError(
      "target_count",
      "aws_appautoscaling_target 리소스가 정확히 하나일 때만 자동 수정할 수 있습니다."
    );
  }

  const target = targets[0];
  if (!target) {
    throw new LiveObservationTerraformUpdateError(
      "target_count",
      "aws_appautoscaling_target 리소스를 찾지 못했습니다."
    );
  }

  const assignments = target.code.match(/^\s*max_capacity\s*=/gm) ?? [];
  const numericAssignment =
    /^(\s*max_capacity\s*=\s*)(\d+)(\s*(?:#.*)?\r?)$/m.exec(target.code);

  if (assignments.length !== 1 || !numericAssignment || numericAssignment.index === undefined) {
    throw new LiveObservationTerraformUpdateError(
      "manual_review_required",
      "max_capacity가 단일 정수 리터럴일 때만 자동 수정할 수 있습니다."
    );
  }

  const assignmentPrefix = numericAssignment[1]!;
  const assignmentValue = numericAssignment[2]!;
  const previousMaxCapacity = Number(assignmentValue);
  if (!Number.isSafeInteger(previousMaxCapacity)) {
    throw new LiveObservationTerraformUpdateError(
      "manual_review_required",
      "max_capacity 정수 값을 안전하게 계산할 수 없습니다."
    );
  }

  const nextMaxCapacity = previousMaxCapacity + 1;
  const file = files.find((candidate) => candidate.fileName === target.fileName);
  if (!file) {
    throw new LiveObservationTerraformUpdateError(
      "manual_review_required",
      "수정할 Terraform 파일을 찾지 못했습니다."
    );
  }

  const valueStart = target.startOffset + numericAssignment.index + assignmentPrefix.length;
  const valueEnd = valueStart + assignmentValue.length;
  const nextTerraformCode =
    file.terraformCode.slice(0, valueStart) +
    String(nextMaxCapacity) +
    file.terraformCode.slice(valueEnd);
  const nextFiles = files.map((candidate) =>
    candidate.fileName === file.fileName
      ? { ...candidate, terraformCode: nextTerraformCode }
      : { ...candidate }
  );

  return {
    address: target.address,
    fileName: target.fileName,
    files: nextFiles,
    nextMaxCapacity,
    previousMaxCapacity
  };
}

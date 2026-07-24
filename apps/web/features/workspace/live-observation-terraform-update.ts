import type { TerraformSyncFileInput } from "@sketchcatch/types";
import { parseTerraformFiles } from "./terraform-panel-utils";

export type LiveObservationTerraformUpdateResult = {
  readonly address: string;
  readonly fileName: string;
  readonly files: readonly TerraformSyncFileInput[];
  readonly line: number;
  readonly nextMaxCapacity: number;
  readonly nextTargetValue: number;
  readonly previousMaxCapacity: number;
  readonly previousTargetValue: number;
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

export function incrementLiveObservationEcsScalingSettings(
  files: readonly TerraformSyncFileInput[]
): LiveObservationTerraformUpdateResult {
  const virtualFiles = files.map(({ fileName, terraformCode }) => ({
    code: terraformCode,
    fileName
  }));
  const blocks = parseTerraformFiles(virtualFiles);
  const targets = blocks.filter(
    (block) =>
      block.blockType === "resource" &&
      block.terraformType === "aws_appautoscaling_target"
  );
  const policies = blocks.filter(
    (block) =>
      block.blockType === "resource" &&
      block.terraformType === "aws_appautoscaling_policy"
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

  if (policies.length !== 1) {
    throw new LiveObservationTerraformUpdateError(
      "manual_review_required",
      "Exactly one aws_appautoscaling_policy resource is required for an automatic update."
    );
  }

  const policy = policies[0];
  if (!policy) {
    throw new LiveObservationTerraformUpdateError(
      "manual_review_required",
      "The aws_appautoscaling_policy resource was not found."
    );
  }

  const targetResourceId = readSingleEcsServiceResourceId(target.code);
  const policyResourceId = readSingleEcsServiceResourceId(policy.code);
  const hasVerifiedEcsIdentity =
    targetResourceId !== null &&
    targetResourceId === policyResourceId &&
    hasSingleTerraformAssignment(
      target.code,
      /^\s*service_namespace\s*=/gm,
      /^\s*service_namespace\s*=\s*"ecs"\s*(?:#.*)?\r?$/m
    ) &&
    hasSingleTerraformAssignment(
      target.code,
      /^\s*scalable_dimension\s*=/gm,
      /^\s*scalable_dimension\s*=\s*"ecs:service:DesiredCount"\s*(?:#.*)?\r?$/m
    ) &&
    hasSingleTerraformAssignment(
      target.code,
      /^\s*resource_id\s*=/gm,
      /^\s*resource_id\s*=\s*"service\/[^"\r\n]+"\s*(?:#.*)?\r?$/m
    ) &&
    hasSingleTerraformAssignment(
      policy.code,
      /^\s*policy_type\s*=/gm,
      /^\s*policy_type\s*=\s*"TargetTrackingScaling"\s*(?:#.*)?\r?$/m
    ) &&
    hasSingleTerraformAssignment(
      policy.code,
      /^\s*service_namespace\s*=/gm,
      /^\s*service_namespace\s*=\s*"ecs"\s*(?:#.*)?\r?$/m
    ) &&
    hasSingleTerraformAssignment(
      policy.code,
      /^\s*scalable_dimension\s*=/gm,
      /^\s*scalable_dimension\s*=\s*"ecs:service:DesiredCount"\s*(?:#.*)?\r?$/m
    ) &&
    hasSingleTerraformAssignment(
      policy.code,
      /^\s*resource_id\s*=/gm,
      /^\s*resource_id\s*=\s*"service\/[^"\r\n]+"\s*(?:#.*)?\r?$/m
    ) &&
    hasSingleTerraformAssignment(
      policy.code,
      /^\s*predefined_metric_type\s*=/gm,
      /^\s*predefined_metric_type\s*=\s*"ALBRequestCountPerTarget"\s*(?:#.*)?\r?$/m
    );
  if (!hasVerifiedEcsIdentity) {
    throw new LiveObservationTerraformUpdateError(
      "manual_review_required",
      "ECS 서비스의 자동 확장 설정인지 확인할 수 없어 직접 검토가 필요합니다."
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

  const targetValueAssignments = policy.code.match(/^\s*target_value\s*=/gm) ?? [];
  const targetValueAssignment =
    /^(\s*target_value\s*=\s*)(\d+)(\s*(?:#.*)?\r?)$/m.exec(policy.code);
  if (
    targetValueAssignments.length !== 1 ||
    !targetValueAssignment ||
    targetValueAssignment.index === undefined
  ) {
    throw new LiveObservationTerraformUpdateError(
      "manual_review_required",
      "target_value must be a single integer literal for an automatic update."
    );
  }

  const assignmentPrefix = numericAssignment[1]!;
  const assignmentValue = numericAssignment[2]!;
  const targetValuePrefix = targetValueAssignment[1]!;
  const targetValue = targetValueAssignment[2]!;
  const previousMaxCapacity = Number(assignmentValue);
  const previousTargetValue = Number(targetValue);
  if (!Number.isSafeInteger(previousMaxCapacity) || !Number.isSafeInteger(previousTargetValue)) {
    throw new LiveObservationTerraformUpdateError(
      "manual_review_required",
      "max_capacity 정수 값을 안전하게 계산할 수 없습니다."
    );
  }

  const nextMaxCapacity = previousMaxCapacity + 1;
  const nextTargetValue = previousTargetValue + 1;
  const file = files.find((candidate) => candidate.fileName === target.fileName);
  if (!file) {
    throw new LiveObservationTerraformUpdateError(
      "manual_review_required",
      "수정할 Terraform 파일을 찾지 못했습니다."
    );
  }

  const policyFile = files.find((candidate) => candidate.fileName === policy.fileName);
  if (!policyFile) {
    throw new LiveObservationTerraformUpdateError(
      "manual_review_required",
      "The Terraform file containing target_value was not found."
    );
  }

  const valueStart = target.startOffset + numericAssignment.index + assignmentPrefix.length;
  const valueEnd = valueStart + assignmentValue.length;
  const targetValueStart =
    policy.startOffset + targetValueAssignment.index + targetValuePrefix.length;
  const targetValueEnd = targetValueStart + targetValue.length;
  const replacements = [
    {
      end: valueEnd,
      fileName: file.fileName,
      start: valueStart,
      value: String(nextMaxCapacity)
    },
    {
      end: targetValueEnd,
      fileName: policyFile.fileName,
      start: targetValueStart,
      value: String(nextTargetValue)
    }
  ];
  const nextFiles = files.map((candidate) => {
    const fileReplacements = replacements
      .filter((replacement) => replacement.fileName === candidate.fileName)
      .sort((left, right) => right.start - left.start);
    let terraformCode = candidate.terraformCode;
    for (const replacement of fileReplacements) {
      terraformCode =
        terraformCode.slice(0, replacement.start) +
        replacement.value +
        terraformCode.slice(replacement.end);
    }
    return { ...candidate, terraformCode };
  });

  return {
    address: target.address,
    fileName: target.fileName,
    files: nextFiles,
    line: file.terraformCode.slice(0, valueStart).split(/\r\n|\r|\n/u).length,
    nextMaxCapacity,
    nextTargetValue,
    previousMaxCapacity,
    previousTargetValue
  };
}

function readSingleEcsServiceResourceId(code: string): string | null {
  const matches = [
    ...code.matchAll(/^\s*resource_id\s*=\s*"(service\/[^"\r\n]+)"\s*(?:#.*)?\r?$/gm)
  ];
  return matches.length === 1 ? (matches[0]?.[1] ?? null) : null;
}

function hasSingleTerraformAssignment(
  code: string,
  assignmentPattern: RegExp,
  expectedLiteralPattern: RegExp
): boolean {
  return (code.match(assignmentPattern) ?? []).length === 1 && expectedLiteralPattern.test(code);
}

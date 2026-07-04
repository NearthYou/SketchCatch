import type { AwsAvailabilityZoneCode } from "../../../../packages/types/src";

export const defaultAwsAvailabilityZone: AwsAvailabilityZoneCode = "ap-northeast-2a";

const awsAvailabilityZoneCodePattern = /^[a-z]{2}-[a-z]+-\d[a-z]$/;

export function isAwsAvailabilityZoneCode(value: unknown): value is AwsAvailabilityZoneCode {
  return typeof value === "string" && awsAvailabilityZoneCodePattern.test(value);
}

export function getAwsAvailabilityZoneLabel(value: unknown): string {
  return isAwsAvailabilityZoneCode(value) ? value : defaultAwsAvailabilityZone;
}

export function getAwsAvailabilityZoneValidationError(value: unknown): string | undefined {
  return isAwsAvailabilityZoneCode(value)
    ? undefined
    : "Availability Zone 형식은 ap-northeast-2a처럼 리전 코드 뒤에 zone 문자가 필요합니다.";
}

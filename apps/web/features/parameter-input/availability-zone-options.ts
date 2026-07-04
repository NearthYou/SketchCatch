import type { AwsAvailabilityZoneCode } from "../../../../packages/types/src";

export const defaultAwsAvailabilityZone: AwsAvailabilityZoneCode = "ap-northeast-2a";

const awsAvailabilityZoneCodePattern = /^[a-z]{2}-[a-z]+-\d[a-z]$/;

export function isAwsAvailabilityZoneCode(value: unknown): value is AwsAvailabilityZoneCode {
  return typeof value === "string" && awsAvailabilityZoneCodePattern.test(value);
}

export function getAwsAvailabilityZoneLabel(value: unknown): string {
  return isAwsAvailabilityZoneCode(value) ? value : defaultAwsAvailabilityZone;
}

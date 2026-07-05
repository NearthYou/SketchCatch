export type AwsAvailabilityZoneOption = {
  readonly value: string;
  readonly label: string;
};

export const defaultAwsAvailabilityZone = "ap-northeast-2a";

export const awsAvailabilityZoneOptions: readonly AwsAvailabilityZoneOption[] = [
  { value: "ap-northeast-2a", label: "Asia Pacific (Seoul) / ap-northeast-2a" },
  { value: "ap-northeast-2b", label: "Asia Pacific (Seoul) / ap-northeast-2b" },
  { value: "ap-northeast-2c", label: "Asia Pacific (Seoul) / ap-northeast-2c" },
  { value: "ap-northeast-1a", label: "Asia Pacific (Tokyo) / ap-northeast-1a" },
  { value: "ap-northeast-1c", label: "Asia Pacific (Tokyo) / ap-northeast-1c" },
  { value: "ap-northeast-1d", label: "Asia Pacific (Tokyo) / ap-northeast-1d" },
  { value: "ap-southeast-1a", label: "Asia Pacific (Singapore) / ap-southeast-1a" },
  { value: "ap-southeast-1b", label: "Asia Pacific (Singapore) / ap-southeast-1b" },
  { value: "ap-southeast-1c", label: "Asia Pacific (Singapore) / ap-southeast-1c" },
  { value: "us-east-1a", label: "US East (N. Virginia) / us-east-1a" },
  { value: "us-east-1b", label: "US East (N. Virginia) / us-east-1b" },
  { value: "us-east-1c", label: "US East (N. Virginia) / us-east-1c" },
  { value: "us-west-2a", label: "US West (Oregon) / us-west-2a" },
  { value: "us-west-2b", label: "US West (Oregon) / us-west-2b" },
  { value: "us-west-2c", label: "US West (Oregon) / us-west-2c" },
  { value: "eu-west-1a", label: "Europe (Ireland) / eu-west-1a" },
  { value: "eu-west-1b", label: "Europe (Ireland) / eu-west-1b" },
  { value: "eu-west-1c", label: "Europe (Ireland) / eu-west-1c" },
  { value: "eu-central-1a", label: "Europe (Frankfurt) / eu-central-1a" },
  { value: "eu-central-1b", label: "Europe (Frankfurt) / eu-central-1b" },
  { value: "eu-central-1c", label: "Europe (Frankfurt) / eu-central-1c" }
];

export function isAwsAvailabilityZoneCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    awsAvailabilityZoneOptions.some((option) => option.value === value)
  );
}

export function getAwsAvailabilityZoneLabel(value: unknown): string {
  const availabilityZoneCode = isAwsAvailabilityZoneCode(value)
    ? value
    : defaultAwsAvailabilityZone;
  const option = awsAvailabilityZoneOptions.find(
    (candidate) => candidate.value === availabilityZoneCode
  );

  return option?.label ?? String(defaultAwsAvailabilityZone);
}

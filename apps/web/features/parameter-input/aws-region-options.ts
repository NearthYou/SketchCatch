import type { AwsRegionCode } from "../../../../packages/types/src";

export type AwsRegionOption = {
  readonly value: AwsRegionCode;
  readonly label: string;
};

export const defaultAwsRegion: AwsRegionCode = "ap-northeast-2";

export const awsRegionOptions: readonly AwsRegionOption[] = [
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" }
];

export function filterAwsRegionOptions(query: string): readonly AwsRegionOption[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return awsRegionOptions;
  }

  return awsRegionOptions.filter((option) =>
    [option.value, option.label].some((text) => text.toLowerCase().includes(normalizedQuery))
  );
}

export function getNextAwsRegionOptionIndex(
  options: readonly AwsRegionOption[],
  currentIndex: number,
  direction: 1 | -1
): number {
  if (options.length === 0) {
    return -1;
  }

  if (currentIndex === -1) {
    return direction === 1 ? 0 : options.length - 1;
  }

  return (currentIndex + direction + options.length) % options.length;
}

export function isAwsRegionCode(value: unknown): value is AwsRegionCode {
  return typeof value === "string" && awsRegionOptions.some((option) => option.value === value);
}

export function getAwsRegionLabel(value: unknown): string {
  const regionCode = isAwsRegionCode(value) ? value : defaultAwsRegion;
  const option = awsRegionOptions.find((candidate) => candidate.value === regionCode);

  return option?.label ?? awsRegionOptions[0]?.label ?? String(defaultAwsRegion);
}

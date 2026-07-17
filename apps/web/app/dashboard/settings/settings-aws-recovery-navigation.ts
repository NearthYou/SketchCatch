const REVERSE_ENGINEERING_RETURN_HREF = "/workspace/reverse" as const;

export type SettingsAwsRecoveryNavigation = {
  readonly includeUnverifiedAwsConnections: boolean;
  readonly returnHref: typeof REVERSE_ENGINEERING_RETURN_HREF | null;
};

// Settings의 AWS 복구 진입만 허용해 일반 Settings 목록의 verified-only 계약을 유지합니다.
export function getSettingsAwsRecoveryNavigation(input: {
  readonly next?: string | readonly string[] | undefined;
  readonly tab?: string | readonly string[] | undefined;
}): SettingsAwsRecoveryNavigation {
  if (input.tab === "aws" && input.next === "reverse") {
    return {
      includeUnverifiedAwsConnections: true,
      returnHref: REVERSE_ENGINEERING_RETURN_HREF
    };
  }

  return {
    includeUnverifiedAwsConnections: false,
    returnHref: null
  };
}

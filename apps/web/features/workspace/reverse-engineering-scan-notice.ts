import type { ReverseEngineeringScanResult } from "../../../../packages/types/src";

export type ReverseEngineeringPartialScanNotice = {
  readonly action: "open_settings" | "none";
  readonly description: string;
  readonly title: string;
};

/** 부분 스캔 결과의 원인에 맞춰 설정 이동이 실제로 필요한 경우에만 안내합니다. */
export function getReverseEngineeringPartialScanNotice(
  result: Pick<ReverseEngineeringScanResult, "coverage" | "scanErrors">
): ReverseEngineeringPartialScanNotice | null {
  const requiresSettings =
    result.coverage?.unavailableServices.some((service) => service.remedy === "open_settings") ||
    result.scanErrors.some((scanError) =>
      ["invalid_region", "not_configured", "permission_denied"].includes(scanError.reason)
    );

  if (requiresSettings) {
    return {
      action: "open_settings",
      description: "가져온 구조는 계속 볼 수 있습니다.",
      title: "일부 AWS 정보는 연결 설정을 확인해야 읽을 수 있습니다."
    };
  }

  const hasRetryableGap =
    result.coverage?.unavailableServices.some((service) => service.remedy === "retry") ||
    result.scanErrors.some((scanError) => scanError.retryable);

  if (hasRetryableGap) {
    return {
      action: "none",
      description: "가져온 구조는 계속 볼 수 있으며, 필요하면 나중에 다시 스캔할 수 있습니다.",
      title: "일부 AWS 정보를 아직 가져오지 못했습니다."
    };
  }

  const hasCapabilityLimit = Boolean(result.coverage?.capabilityLimits?.length);
  if (hasCapabilityLimit) {
    return {
      action: "none",
      description: "가져온 구조는 계속 볼 수 있습니다.",
      title: "일부 AWS 정보는 현재 가져오기 범위에 포함되지 않습니다."
    };
  }

  return null;
}

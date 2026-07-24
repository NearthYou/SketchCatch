import type { ReverseEngineeringScanError } from "@sketchcatch/types";
import {
  getReverseEngineeringProviderTypeLabel,
  getReverseEngineeringResourceKindLabel,
  getReverseEngineeringResourceTypeLabel,
  getReverseEngineeringServiceLabel,
  presentReverseEngineeringResource,
  presentReverseEngineeringScanErrors as presentDetailScanErrors,
  summarizeReverseEngineeringScan,
  type ReverseEngineeringScanErrorPresentation as DetailScanErrorPresentation
} from "./reverse-engineering-detail-presentation";

export {
  getReverseEngineeringProviderTypeLabel,
  getReverseEngineeringResourceKindLabel,
  getReverseEngineeringResourceTypeLabel,
  getReverseEngineeringServiceLabel,
  presentReverseEngineeringResource,
  summarizeReverseEngineeringScan
};

export type ReverseEngineeringScanErrorPresentation = DetailScanErrorPresentation & {
  readonly serviceName: string;
};

/** gg: 새 상세 모델의 서비스 label을 기존 상세 화면이 쓰던 이름으로도 제공합니다. */
export function presentReverseEngineeringScanErrors(
  scanErrors: readonly ReverseEngineeringScanError[]
): readonly ReverseEngineeringScanErrorPresentation[] {
  return presentDetailScanErrors(scanErrors).map((presentation) => ({
    ...presentation,
    serviceName: presentation.serviceLabel
  }));
}

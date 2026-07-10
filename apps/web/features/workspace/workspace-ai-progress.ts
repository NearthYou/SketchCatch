import type { ArchitectureDraftProgressStage } from "@sketchcatch/types";

const ARCHITECTURE_DRAFT_PROGRESS_ITEMS = [
  { stage: "preparing_requirements", label: "요구사항을 정리하고 있어요" },
  { stage: "normalizing_requirements", label: "생성 조건을 구조화하고 있어요" },
  { stage: "querying_amazon_q", label: "Amazon Q 아키텍처 근거를 확인하고 있어요" },
  { stage: "validating_architecture", label: "Amazon Q 응답을 검증하고 있어요" },
  { stage: "building_diagram", label: "리소스와 연결을 다이어그램으로 구성하고 있어요" }
] as const satisfies readonly {
  readonly stage: ArchitectureDraftProgressStage;
  readonly label: string;
}[];

export function createArchitectureDraftProgressItems(activeStage: ArchitectureDraftProgressStage) {
  const activeIndex = ARCHITECTURE_DRAFT_PROGRESS_ITEMS.findIndex(
    (item) => item.stage === activeStage
  );

  return ARCHITECTURE_DRAFT_PROGRESS_ITEMS.map((item, index) => ({
    ...item,
    status: index < activeIndex ? "complete" : index === activeIndex ? "active" : "pending"
  } as const));
}

import { TEMPLATE_IDS, type TemplateId } from "../../../../packages/types/src";
import { BOARD_THUMBNAIL_CAPTURE_CONTRACT } from "../../components/architecture-board/board-thumbnail-capture-contract";

export type TemplateThumbnailAsset = {
  readonly captureVersion: number;
  readonly diagramHash: string;
  readonly src: string;
  readonly templateId: TemplateId;
};

const TEMPLATE_THUMBNAIL_VERSION = `v${BOARD_THUMBNAIL_CAPTURE_CONTRACT.version}`;

const TEMPLATE_DIAGRAM_HASHES: Record<TemplateId, string> = {
  "ecs-fargate-container-app": "be434089f0bc1eed48019b7d920c15195cdcad2a69e1a151c82c6464abc4a2fc",
  "eks-container-app": "1c22d2b239590a79735f7069abb70c6cdaf51bdfb95eb05cbe12736058713812",
  "full-serverless-web-app": "6c1984128c9552c9a211653614df31829bc0bcecfb5223daea6148f858e9a80d",
  "minimal-serverless-api": "b1f8986e65b14f5bbba9dd5eaf41541c7163ddc2a7fde4c4981593731b9bfafa",
  "static-web-hosting": "aa58cb0f15d92fb54c7da132a9492886aa06add1dda75f4370bb679e9182b9cf",
  "three-tier-web-app": "84371049077bf2836fd3ce4cefa42cee3b5fb36b683815bc354b854185ce3248"
};

// 실제 DiagramEditor에서 캡처해 검토한 asset만 Template 카드에 연결합니다.
export const TEMPLATE_THUMBNAIL_ASSETS: Record<TemplateId, TemplateThumbnailAsset> = Object.fromEntries(
  TEMPLATE_IDS.map((templateId) => [
    templateId,
    {
      captureVersion: BOARD_THUMBNAIL_CAPTURE_CONTRACT.version,
      diagramHash: TEMPLATE_DIAGRAM_HASHES[templateId],
      src: `/template-thumbnails/${TEMPLATE_THUMBNAIL_VERSION}/${templateId}.webp`,
      templateId
    }
  ])
) as Record<TemplateId, TemplateThumbnailAsset>;

// Template id에 대응하는 versioned capture를 단일 manifest에서 조회합니다.
export function getTemplateThumbnailAsset(templateId: TemplateId): TemplateThumbnailAsset {
  return TEMPLATE_THUMBNAIL_ASSETS[templateId];
}

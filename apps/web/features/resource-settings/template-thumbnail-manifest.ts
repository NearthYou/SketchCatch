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
  "ecs-fargate-container-app": "f223557a8a9f7f169a46e06a7c05bad6e33e89542983cfb16ed87827a20d8ccf",
  "eks-container-app": "2161c0261e624d7d515b0d703b17bb7f500003b4d4c62056c225fbcffdb55021",
  "full-serverless-web-app": "e8fc3ef3ee7b8264ec80bd2aacec75d5035973e945cf08a28ca61221cb65baec",
  "minimal-serverless-api": "7be15b51fc305b4c71d22e938e148ad3ee9e024f33b3a6f271613447477aabf2",
  "static-web-hosting": "f1e0101ddece527b97bb48cf14fe9e15a7dcdecd24b1c3bf5ba2a784c01639cb",
  "three-tier-web-app": "56d196cfe6dab161cb48322db807b3dca95f0c86014458b3648aefc4fb9e6267"
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

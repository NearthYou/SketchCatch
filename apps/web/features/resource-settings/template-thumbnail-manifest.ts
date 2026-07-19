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
  "ecs-fargate-container-app": "723a166ef8773e943c3a4f30fcf97cfe8b1cee666c83beb6a90108bed69b250a",
  "eks-container-app": "33534fa2886dce8805ae1d372b48d2e09fc456870c8d447c468ea7fc5ce3583a",
  "full-serverless-web-app": "e397f239078f9645a15fe6e903adc6a4c1fef658ecbbffe2409c2ebc761df9f6",
  "minimal-serverless-api": "76f480e46e407f4e035f6252b7cbabf61d33545306e76c31ea11f1282a36efa7",
  "static-web-hosting": "f362b3775ded876f35d085da8495e5e4eedefe6ec4d9f24b630664ba05a419ad",
  "three-tier-web-app": "dbf080865e54ae3ca25d84aeb82411c81487eb0ce9d1283f243a2926a9d8b304"
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

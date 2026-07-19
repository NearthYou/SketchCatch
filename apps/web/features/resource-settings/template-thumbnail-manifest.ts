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
  "ecs-fargate-container-app": "731a069fbfd249cc04dfa6e91585a8e840f86359c7a0a37fa3fe7d7fe46c2a0f",
  "eks-container-app": "d04690eb466087086f8a7e9baae4088ec19ea30102ebb565027ecafdfbf4be83",
  "full-serverless-web-app": "3a33bad19bf27db482ffb17fc741a2559032c3471d42e30671bfa54649e0305f",
  "minimal-serverless-api": "a5bc66889b17d169d90162243de999edbc896bd2e24e61b89e415357a52ddced",
  "static-web-hosting": "f425261d25bef0be7adda988ac07a000b2daa3088d0d6bf672c938bf09433558",
  "three-tier-web-app": "c0a5dbe295105c5bc5962ecc2b40c2369dc32c63276d647cd06d66516e1981eb"
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

import {
  BRAINBOARD_TEMPLATE_IDS,
  brainboardFailedCaptureEvidence,
  type BrainboardTemplateId
} from "../../../../packages/types/src";
import { BOARD_THUMBNAIL_CAPTURE_CONTRACT } from "../../components/architecture-board/board-thumbnail-capture-contract";

export type BrainboardBoardCaptureAsset = {
  readonly captureVersion: number;
  readonly diagramHash: string;
  readonly kind: "board-capture";
  readonly src: string;
  readonly templateId: BrainboardTemplateId;
};

export type BrainboardSourcePreviewAsset = {
  readonly kind: "source-preview";
  readonly originalHeight: number;
  readonly originalWidth: number;
  readonly sourcePreviewUrl: string;
  readonly src: string;
  readonly templateId: BrainboardTemplateId;
};

export type BrainboardTemplateThumbnailAsset =
  | BrainboardBoardCaptureAsset
  | BrainboardSourcePreviewAsset;

const BRAINBOARD_THUMBNAIL_VERSION = `v${BOARD_THUMBNAIL_CAPTURE_CONTRACT.version}`;

const BRAINBOARD_DIAGRAM_HASHES: Record<
  Exclude<BrainboardTemplateId, "brainboard-aws-instance-db-multiple-networks">,
  string
> = {
  "brainboard-aws-asg-lb-vpc-subnets":
    "141aa6015be8b1e4ca1daa3bca7102388d62783d05a956139ed3e5c8bc8621a6",
  "brainboard-aws-bastion": "ce46917bc0aadf54a9b9386d06d61b6abdd3f9aa13e9f1190bf396e80efef1e0",
  "brainboard-aws-costs-monitoring":
    "208a7db1329a496d351d9139b1375d786529427b0ea29e771d545d77fca26d28",
  "brainboard-aws-dashcam-video-pipeline":
    "8fb29ae246da5502f32a1b7148d39a5933bd42e112b69c660b1e7e7917537555",
  "brainboard-aws-ec2-vpc-subnet":
    "730ffcbf3180052632e3e5e43cdf57be40c772685ca4f59b032db42ba08f215b",
  "brainboard-aws-ecs-fargate": "0c06a1c14732326561b5902a923c2c37486548e09e1461bacee0018faba50d3f",
  "brainboard-aws-elastic-beanstalk":
    "8ac3f06325d19da9a5ec53e0474af823f5d21f61c79163aadd2330ecd1762f77",
  "brainboard-aws-fsx": "8fb9055d1244777a5ff22764996e7de9a01dfece3749e87674f15fe46094e58c",
  "brainboard-aws-iam-users": "d5d2075b21c3e5a79503648fef616374e57b495bfe6c1d4b6c42d581052ea880",
  "brainboard-aws-jenkins-ec2": "30c0f38c9099366518bdf993d1bdcfccd62f74888eccec96a4be6ad05aae57ba",
  "brainboard-aws-kubernetes-native-cnis":
    "20d87cc62d6bce1d2539ff1370cfc712668e9b2154f18b1db83fe394c278149a",
  "brainboard-aws-load-balancer-target-group":
    "756a4777b32c39e0917f2066222da96f8bc7200c833bbf62a622ed4fbe19946f",
  "brainboard-aws-multi-account-management":
    "5cf1c84ea9fd05b5d8b5619d73c7166437949f8d66fe78191a2cfbcecebef5f3",
  "brainboard-aws-network-landing-zone":
    "dff8db0f167897a4830827ca2cfcb1e8b7d2754e3dce6675a7540bddb9953d38",
  "brainboard-aws-rds": "99796e29db38041867bc54d14d526f59471d597dc136940a961cd8efb0c2ab0b",
  "brainboard-aws-rest-api-documentdb":
    "791ec09ca18793ee566d7439462a3936620239c6390be9d71e17a5895af727f3",
  "brainboard-aws-s3-api-gateway":
    "901230b51b7e5a33191167bee13639356716c5c7b61c8ff75819aaa1517c43ef",
  "brainboard-aws-secure-s3-bucket":
    "e955a005f7358bcb59eaaa0d215d89eacd824811707cb8302303ad30856d32ce",
  "brainboard-aws-serverless-cdn":
    "a64d56f71dab662d0c74462251926b64c8ee9076595e1e2f1b273251598ff244",
  "brainboard-aws-three-tier-database":
    "55a9c8af9c33fc8225f4da9a5600aa5a413645a1aba47e0f5638c03bd0aeb4fc",
  "brainboard-aws-vpc-subnets-security-groups-2az":
    "c7106a31c5540ee3e78247cfb5dd093cb991f91960b9b93453022c93914e75f3",
  "brainboard-cross-account-aws-s3":
    "4911e8662c5a1894e632e55bb954ec541b2673c9cabb31b1961a4802b7f95a86",
  "brainboard-training-aws-onboarding":
    "5072bb6ea891b89ea19530a8c234d89b0fb457f161aec24a0ffec5136a5cb86f"
};

export const BRAINBOARD_TEMPLATE_THUMBNAIL_ASSETS = Object.fromEntries(
  BRAINBOARD_TEMPLATE_IDS.map(
    (templateId): readonly [BrainboardTemplateId, BrainboardTemplateThumbnailAsset] => {
      const src = `/template-thumbnails/brainboard/${BRAINBOARD_THUMBNAIL_VERSION}/${templateId}.webp`;

      if (templateId === brainboardFailedCaptureEvidence.id) {
        return [
          templateId,
          {
            kind: "source-preview",
            originalHeight: brainboardFailedCaptureEvidence.origin.previewHeight,
            originalWidth: brainboardFailedCaptureEvidence.origin.previewWidth,
            sourcePreviewUrl: brainboardFailedCaptureEvidence.origin.previewUrl,
            src,
            templateId
          }
        ];
      }

      return [
        templateId,
        {
          captureVersion: BOARD_THUMBNAIL_CAPTURE_CONTRACT.version,
          diagramHash: BRAINBOARD_DIAGRAM_HASHES[templateId],
          kind: "board-capture",
          src,
          templateId
        }
      ];
    }
  )
) as Record<BrainboardTemplateId, BrainboardTemplateThumbnailAsset>;

export function getBrainboardTemplateThumbnailAsset(
  templateId: BrainboardTemplateId
): BrainboardTemplateThumbnailAsset {
  return BRAINBOARD_TEMPLATE_THUMBNAIL_ASSETS[templateId];
}

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
    "b970e2afc7b61694343020f7458aa5d1f502f297b139ae8b2917ab0261823776",
  "brainboard-aws-bastion": "e17b87bc82d942e63e986f599e89e74470180cdfc325f2044723c5a10f7e7069",
  "brainboard-aws-costs-monitoring":
    "4a973c63dc03a18cd20d4f45023e3ca717b84ac9cc6a1522ee8da28e908f5dc5",
  "brainboard-aws-dashcam-video-pipeline":
    "bb16b489ec16cd86b03949ca567eb5e428f9499606a5aaa628e61ba58ee2f72c",
  "brainboard-aws-ec2-vpc-subnet":
    "57a63a5e86e063c37637b87653628d4b5600b2ef57db8f4c28182fdefa53ef9d",
  "brainboard-aws-ecs-fargate": "0a491e4712ec345dbf6eec7cd3fa2434fb3bcd1563208be4f23943227c6cd203",
  "brainboard-aws-elastic-beanstalk":
    "6dd68ae6275d324b3694c95c909679314e95fd6d0a3fc0ae76dc10e9b3722ee3",
  "brainboard-aws-fsx": "f1ed1d3f86a0a0e2a2ba2d1a392b84c738707568bfb3c7c625eb08fb042d3c04",
  "brainboard-aws-iam-users": "915e6459a49c88d98ee04248a730e96e2975f148e284946bb93a509b4a838a38",
  "brainboard-aws-jenkins-ec2": "a9e5d79be18c01feefcb414f5c14009127131483e9957031f79326e7bac850d1",
  "brainboard-aws-kubernetes-native-cnis":
    "c092c896a667347d22757b5dd36129317fa3778edcbc9f506315093b1ffee673",
  "brainboard-aws-load-balancer-target-group":
    "a9346e24c1dfe6fedd61222d0b3e93098e53f4e50572c9cf4907666eeaa987c2",
  "brainboard-aws-multi-account-management":
    "05e91488e638bc3c6d7117890cfb6bb3a74bc562b5a4e0eb4287585367d9cc5e",
  "brainboard-aws-network-landing-zone":
    "714302c223c7eda065bffe36053b74554d44ee28659c129bedd149c3c0cab075",
  "brainboard-aws-rds": "b46265897dbc2892077a4520e969ca011672f2d4c5191e633013bb3152e88427",
  "brainboard-aws-rest-api-documentdb":
    "d888fb0d006bc7a04c73fdb70a0e9aad5b8e6d380c39715bcfc929d14ce0cc25",
  "brainboard-aws-s3-api-gateway":
    "11ce0d13017707839da486dca6dd6b04684cbe2134890e76d6ea7482fb89b6c1",
  "brainboard-aws-secure-s3-bucket":
    "adb3199c27d6dca1d1146644d796c7ebe99e8be8497d0b462cb3c73a27c60c8f",
  "brainboard-aws-serverless-cdn":
    "2006a6484ab3bde9354f46f252124b3b3bbb73b4941f4bd8f3d2faa6030fb8bd",
  "brainboard-aws-three-tier-database":
    "144d8deb8598e038378650c6e46becf4c8f993611f0dd1c5f0d0d4bd97fb5f88",
  "brainboard-aws-vpc-subnets-security-groups-2az":
    "b1cc69054769ce5048f60f2d3773153ac143e33249229a153d1efab10ca78ba7",
  "brainboard-cross-account-aws-s3":
    "c252f96d3b0699ff79f580e6eb6b5179cdc04ea0e49149eeedd41f067a762112",
  "brainboard-training-aws-onboarding":
    "f857f367e4236169a5ddfb43272563a2d674ee36bb64b19a7ad0c11fb00f97d9"
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

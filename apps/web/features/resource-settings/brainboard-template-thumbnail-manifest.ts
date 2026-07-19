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
    "7f0355abdd9dff5066cd1a7b765399384b2624b44eb9771f52be36e41cdf6e74",
  "brainboard-aws-bastion": "42825310aa18164fab9541ec35665a75411679da0886f264a90a7cad0bf1138b",
  "brainboard-aws-costs-monitoring":
    "4a973c63dc03a18cd20d4f45023e3ca717b84ac9cc6a1522ee8da28e908f5dc5",
  "brainboard-aws-dashcam-video-pipeline":
    "bb16b489ec16cd86b03949ca567eb5e428f9499606a5aaa628e61ba58ee2f72c",
  "brainboard-aws-ec2-vpc-subnet":
    "66798b44ef735a042ada67101064e16a5ceaae930179629bca96215d1e828756",
  "brainboard-aws-ecs-fargate": "12cb4a0cc5973028c8a4329068e02bc3867ce522a781487a3f571b3fa3dbbe36",
  "brainboard-aws-elastic-beanstalk":
    "471bf6fffdbdbfd3403e43eb9de143cb1f4378507f71fded12d57663806d0ff6",
  "brainboard-aws-fsx": "9e045f25b5cf123e958e82f71e328ac3bb9206b0b55b18d917afb28b5bba7d62",
  "brainboard-aws-iam-users": "add9a650c98d6b69e56e51db1d5e45235e39012c89c547075750c281e4a8f7e5",
  "brainboard-aws-jenkins-ec2": "a9e5d79be18c01feefcb414f5c14009127131483e9957031f79326e7bac850d1",
  "brainboard-aws-kubernetes-native-cnis":
    "6213435ea8c4801e79834ec86d29f92212d20f1bee124b249fdec0995b8762b5",
  "brainboard-aws-load-balancer-target-group":
    "eb96d6c3b12fc4d64e63d8c764ce7e50de02e738d55653e83c5d09cc51ccaab6",
  "brainboard-aws-multi-account-management":
    "9ba24eb105075b45e3946668f2c97940ed207b1de88b2494f61fbd6ffedba830",
  "brainboard-aws-network-landing-zone":
    "e7242e63a4944507a51ec81c88f8c3c8434c291a9307f0dd625238d33787547a",
  "brainboard-aws-rds": "b06ff07c8367a246b5f8ad1c221570c3ba9898bb20febcd26150f177161533b4",
  "brainboard-aws-rest-api-documentdb":
    "8434c53756c82a20f892fd2e36965dae8827ffeab48ccff9d31400e038252f8c",
  "brainboard-aws-s3-api-gateway":
    "11ce0d13017707839da486dca6dd6b04684cbe2134890e76d6ea7482fb89b6c1",
  "brainboard-aws-secure-s3-bucket":
    "adb3199c27d6dca1d1146644d796c7ebe99e8be8497d0b462cb3c73a27c60c8f",
  "brainboard-aws-serverless-cdn":
    "99db9a91634ab796761c045deca5636273fdb82e78cd1119c0ba2863c90aab77",
  "brainboard-aws-three-tier-database":
    "7488c04f9ac1071f1ff689afc4bdb0661735ac590deaa0f3fc01ca0a077d9729",
  "brainboard-aws-vpc-subnets-security-groups-2az":
    "88d10829a18f30f48e44c2263efcba90317adf673c12500511582c61c58acc22",
  "brainboard-cross-account-aws-s3":
    "c252f96d3b0699ff79f580e6eb6b5179cdc04ea0e49149eeedd41f067a762112",
  "brainboard-training-aws-onboarding":
    "0b83b296818d60ebe05965dbce9505cb168f0d44f971228410231d8c82e57af4"
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

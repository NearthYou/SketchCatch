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
    "6e2de2d55a0b791d9070a190a0de19545c1641b22e805368084558124395a7b5",
  "brainboard-aws-bastion": "09aebbebc31db11df7cccbd3b7f360c4045158e05f2dc9c18aba0969043c878e",
  "brainboard-aws-costs-monitoring":
    "edc1ec9c1e36d33be9da76a7316a994ae3a6b692990245fa80499a6b7771e6fe",
  "brainboard-aws-dashcam-video-pipeline":
    "13329003388cf42acef1aaf3ece307ec5ed277a62ef275ec4afa56f06778c7ec",
  "brainboard-aws-ec2-vpc-subnet":
    "57a63a5e86e063c37637b87653628d4b5600b2ef57db8f4c28182fdefa53ef9d",
  "brainboard-aws-ecs-fargate": "11f3999c276edb7c6d38730a03c151f04e901a7128b1b6dc3d9485a406f8be44",
  "brainboard-aws-elastic-beanstalk":
    "d977e40a398c96482161ea971770fc2f17992d9ee2f62f301f42943a841b9766",
  "brainboard-aws-fsx": "f6a6cfc1d9d2e2721793ad3d2d447bd876d0049e4c758264135f28b4593d8527",
  "brainboard-aws-iam-users": "0032f96ad83cb5302421a5c6ef4cc2956a890af545ebbbca6c2d919330d9ebcc",
  "brainboard-aws-jenkins-ec2": "408409492b3370060eb0c1793e92ffebfcca1fef57f89ad3a8de041b4dab7af7",
  "brainboard-aws-kubernetes-native-cnis":
    "10f145be3fac859b443bbfb263abced1b51e8a2b07d2c4832f19a40d413084b5",
  "brainboard-aws-load-balancer-target-group":
    "5cd8e41aae2373ef151c63da88789c092f4fab46ce22e97ae41c46cdce13d819",
  "brainboard-aws-multi-account-management":
    "30ee81e3c17dfb3f7c6b20738060d2d1a2b803258e1cd4ac3572232fac708c7b",
  "brainboard-aws-network-landing-zone":
    "714302c223c7eda065bffe36053b74554d44ee28659c129bedd149c3c0cab075",
  "brainboard-aws-rds": "451b58ef6f24ba6a94695f7c8f3e3917f28f586b271284f2e4ac30662df1d574",
  "brainboard-aws-rest-api-documentdb":
    "048a12f75d30508e6daf8bbd1b299a3c1a62cf4eae0e0cbf5f3137d5970a4b51",
  "brainboard-aws-s3-api-gateway":
    "9d9d5081832350021620132775816a597ab2b6bd15949e5ee72e8f7970313802",
  "brainboard-aws-secure-s3-bucket":
    "d51348ca882c7ca366edcf0de52393a91fbd7b2f14cc145f3136f41dc52ed814",
  "brainboard-aws-serverless-cdn":
    "6fe579e4a24783f515fa249a10c3aa91da6f05f963451e09f88878d04d3dafb5",
  "brainboard-aws-three-tier-database":
    "27c0493e15e1944bdeb05127ddc8eb757dd7ca827ae372f1d627d32483823fd1",
  "brainboard-aws-vpc-subnets-security-groups-2az":
    "6536a44aea8d849e8cff672fd8758b2a56690f13208842fade6446c6b9c47b43",
  "brainboard-cross-account-aws-s3":
    "376abc25e88aa247034ea3f21c04a14133805a547e730e0d97ad6731b70ad19a",
  "brainboard-training-aws-onboarding":
    "a7b7cae9ea9ae29dfcadfb54ab927a5673deb63183f52db6d486e98b7be2b4fb"
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

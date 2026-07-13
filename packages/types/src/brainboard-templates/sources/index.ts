import type { BrainboardTemplateSource } from "../source-types.js";
import { awsKubernetesNativeCnisSource } from "./aws-kubernetes-native-cnis.js";
import { trainingAwsOnboardingSource } from "./training-aws-onboarding.js";

export { awsKubernetesNativeCnisSource } from "./aws-kubernetes-native-cnis.js";
export { trainingAwsOnboardingSource } from "./training-aws-onboarding.js";

/** Partial deployable registry: only reviewed fixture ranks 1-2 are registered here. */
export const brainboardTemplateSources = [
  trainingAwsOnboardingSource,
  awsKubernetesNativeCnisSource
] as const satisfies readonly BrainboardTemplateSource[];

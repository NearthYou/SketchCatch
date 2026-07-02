import type { AiTerraformErrorExplanationResult } from "@sketchcatch/types";

export type TerraformErrorExplanationResultItem = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
};

export function createTerraformErrorExplanationItems(
  explanation: AiTerraformErrorExplanationResult
): TerraformErrorExplanationResultItem[] {
  return [
    {
      id: "likely-cause",
      label: `${explanation.severity.toUpperCase()} · ${explanation.category}`,
      text: explanation.likelyCause
    },
    ...explanation.nextActions.map((action, index) => ({
      id: `next-action-${index}`,
      label: "다음 행동",
      text: action
    }))
  ];
}

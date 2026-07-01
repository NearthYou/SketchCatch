import type { ProjectDeleteAction, ProjectDeletePreview } from "@sketchcatch/types";

export type ProjectActionMenuItemKind = ProjectDeleteAction | "edit";

export type ProjectActionMenuItem = {
  readonly disabled: boolean;
  readonly kind: ProjectActionMenuItemKind;
  readonly label: string;
};

export function getProjectActionMenuItems(
  preview: ProjectDeletePreview
): readonly ProjectActionMenuItem[] {
  const availableActions = new Set(preview.availableActions);
  const deleteItems: ProjectActionMenuItem[] =
    preview.activeResourceCount > 0
      ? [
          {
            disabled: !availableActions.has("destroy_then_delete"),
            kind: "destroy_then_delete",
            label: "리소스 포함 삭제"
          },
          {
            disabled: !availableActions.has("delete_project_only"),
            kind: "delete_project_only",
            label: "프로젝트만 삭제"
          }
        ]
      : [
          {
            disabled: !availableActions.has("delete_project"),
            kind: "delete_project",
            label: "프로젝트 삭제"
          }
        ];

  return [
    ...deleteItems,
    {
      disabled: false,
      kind: "edit",
      label: "수정"
    }
  ];
}

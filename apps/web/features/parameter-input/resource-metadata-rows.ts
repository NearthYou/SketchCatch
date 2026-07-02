import type { ResourceNodeParameters } from "../../../../packages/types/src";

type EditableResourceMetadataKey = "fileName" | "resourceName";

export type ResourceMetadataRow =
  | {
      readonly editable: true;
      readonly key: EditableResourceMetadataKey;
      readonly label: string;
      readonly value: string;
    }
  | {
      readonly editable: false;
      readonly key: "resourceType";
      readonly label: string;
      readonly value: string;
    };

export function buildResourceMetadataRows(
  parameters: Pick<ResourceNodeParameters, "fileName" | "resourceName" | "resourceType">
): readonly ResourceMetadataRow[] {
  return [
    {
      editable: true,
      key: "resourceName",
      label: "Resource name",
      value: parameters.resourceName
    },
    {
      editable: true,
      key: "fileName",
      label: "File name",
      value: parameters.fileName
    },
    {
      editable: false,
      key: "resourceType",
      label: "Resource type",
      value: parameters.resourceType
    }
  ];
}

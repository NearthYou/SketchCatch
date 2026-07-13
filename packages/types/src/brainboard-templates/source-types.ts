import type { BrainboardTemplateId } from "./ids.js";

export type BrainboardTemplateCaptureStatus = "captured" | "materialized" | "verified" | "failed";

export type BrainboardSourceValue =
  | string
  | number
  | boolean
  | null
  | readonly BrainboardSourceValue[]
  | { readonly [key: string]: BrainboardSourceValue };

export type BrainboardSourcePoint = {
  readonly x: number;
  readonly y: number;
};

export type BrainboardSourceSize = {
  readonly width: number;
  readonly height: number;
};

export type BrainboardSourceViewport = BrainboardSourcePoint & BrainboardSourceSize;

type BrainboardSourceNodeBase = {
  readonly sourceNodeId: string;
  readonly domOrder: number;
  readonly label: string;
  readonly position: BrainboardSourcePoint;
  readonly size: BrainboardSourceSize;
  readonly parentSourceNodeId: string | null;
  readonly zIndex: number;
};

export type BrainboardSourceResourceNode = BrainboardSourceNodeBase & {
  readonly kind: "resource";
  readonly terraformBlockType: "resource" | "data";
  readonly terraformResourceType: string;
  readonly resourceName: string;
  readonly fileName: string;
  readonly values: Readonly<Record<string, BrainboardSourceValue>>;
};

export type BrainboardSourcePresentationNode = BrainboardSourceNodeBase & {
  readonly kind: "presentation";
  readonly catalogId: string;
};

export type BrainboardSourceNode = BrainboardSourceResourceNode | BrainboardSourcePresentationNode;

export type BrainboardSourceArrowDirection =
  | "source-to-target"
  | "target-to-source"
  | "bidirectional"
  | "none";

export type BrainboardSourceEdge = {
  readonly sourceEdgeId: string;
  readonly domOrder: number;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly sourcePort: string;
  readonly targetPort: string;
  readonly svgPath: string;
  readonly waypoints: readonly BrainboardSourcePoint[];
  readonly arrowDirection: BrainboardSourceArrowDirection;
  readonly arrowAngle: number;
};

export type BrainboardTerraformFile = {
  readonly fileName: string;
  readonly code: string;
  readonly sha256: string;
  readonly includeInWorkspace: boolean;
};

export type BrainboardTemplateOrigin = {
  readonly platform: "brainboard";
  readonly author: "Chafik Belhaoues";
  readonly sourceTemplateId: string;
  readonly sourceUrl: string;
  readonly cloneArchitectureId: string | null;
  readonly downloads: number;
  readonly capturedAt: string;
};

export type BrainboardTemplateSource = {
  readonly id: BrainboardTemplateId;
  readonly origin: BrainboardTemplateOrigin;
  readonly captureStatus: BrainboardTemplateCaptureStatus;
  readonly title: string;
  readonly description: string;
  readonly provider: "aws";
  readonly viewport: BrainboardSourceViewport;
  readonly nodes: readonly BrainboardSourceNode[];
  readonly edges: readonly BrainboardSourceEdge[];
  readonly terraform: {
    readonly files: readonly BrainboardTerraformFile[];
    readonly resourceAddresses: readonly string[];
  };
};

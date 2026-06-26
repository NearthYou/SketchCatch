type SampleDiagramNode = {
  readonly id: string;
  readonly type: string;
  readonly kind: "resource";
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
  readonly size: {
    readonly width: number;
    readonly height: number;
  };
  readonly label: string;
  readonly locked: boolean;
  readonly zIndex: number;
  readonly parameters: {
    readonly terraformBlockType: "resource";
    readonly resourceType: string;
    readonly resourceName: string;
    readonly fileName: string;
    readonly values: Record<string, unknown>;
  };
};

type SampleDiagramJson = {
  readonly nodes: readonly SampleDiagramNode[];
  readonly edges: readonly {
    readonly id: string;
    readonly sourceNodeId: string;
    readonly targetNodeId: string;
  }[];
  readonly viewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
};

export type TerraformGenerateResponseBody = {
  readonly terraformCode: string;
};

export const sampleDiagramJson: SampleDiagramJson = {
  nodes: [
    makeSampleNode({
      id: "node-1",
      type: "aws_vpc",
      kind: "resource",
      label: "main_vpc",
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "main",
        fileName: "main",
        values: {
          cidrBlock: "10.0.0.0/16",
          enableDnsSupport: true,
          enableDnsHostnames: true,
          tags: {
            Name: "main-vpc"
          }
        }
      }
    }),
    makeSampleNode({
      id: "node-2",
      type: "aws_subnet",
      kind: "resource",
      label: "public_subnet",
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_subnet",
        resourceName: "public",
        fileName: "main",
        values: {
          vpcId: "aws_vpc.main.id",
          cidrBlock: "10.0.1.0/24",
          availabilityZone: "ap-northeast-2a",
          mapPublicIpOnLaunch: true,
          tags: {
            Name: "public-subnet"
          }
        }
      }
    })
  ],
  edges: [
    {
      id: "edge-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2"
    }
  ],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  }
};

// 샘플 DiagramJson이 실제 보드 저장 책임을 가져오지 않도록 데모용 기본 좌표만 채웁니다.
function makeSampleNode(
  node: Omit<SampleDiagramNode, "position" | "size" | "locked" | "zIndex"> &
    Partial<Pick<SampleDiagramNode, "position" | "size" | "locked" | "zIndex">>
): SampleDiagramNode {
  return {
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 160,
      height: 96
    },
    locked: false,
    zIndex: 0,
    ...node
  };
}

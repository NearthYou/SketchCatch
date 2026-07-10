import { RoutePlaceholder } from "../../../components/runtime/route-placeholder";

type ReverseWorkspacePageProps = {
  readonly searchParams?: Promise<{
    readonly projectName?: string | string[] | undefined;
  }>;
};

export default async function ReverseWorkspacePage({ searchParams }: ReverseWorkspacePageProps) {
  const params = await searchParams;
  const projectName = getSingleSearchParam(params?.projectName)?.trim() || "기존 AWS 가져오기";

  return (
    <RoutePlaceholder
      description="Provider Adapter, AWS 연결, 스캔, 후보 판단, ArchitectureJson 적용 연결부는 보존되어 있습니다."
      links={[{ href: "/workspace/new", label: "시작 방식 다시 선택" }]}
      title="Reverse Engineering 연결부"
    >
      <p>프로젝트 이름: {projectName}</p>
    </RoutePlaceholder>
  );
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

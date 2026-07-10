import { RoutePlaceholder } from "../../components/runtime/route-placeholder";

type WorkspacePageProps = {
  readonly searchParams?: Promise<{
    readonly projectId?: string | string[] | undefined;
  }>;
};

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const params = await searchParams;
  const projectId = getSingleSearchParam(params?.projectId)?.trim();

  return (
    <RoutePlaceholder
      description="Architecture Board, ArchitectureJson 저장·불러오기, IaC Preview, Deployment 연결부는 보존되어 있으며 새 UI가 연결될 자리입니다."
      links={[
        { href: "/workspace/new", label: "새 프로젝트 시작" },
        { href: "/workspace/ai", label: "AI Architecture Draft 시작" },
        { href: "/workspace/reverse", label: "Reverse Engineering 시작" }
      ]}
      title="Workspace 연결부"
    >
      <dl>
        <dt>Project ID</dt>
        <dd>{projectId || "새 프로젝트 또는 로컬 Workspace"}</dd>
        <dt>다시 연결할 핵심 흐름</dt>
        <dd>Architecture Board → IaC Preview → Pre-Deployment Check → Deployment</dd>
      </dl>
    </RoutePlaceholder>
  );
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

import { RoutePlaceholder } from "../../../../components/runtime/route-placeholder";

type ProjectDetailPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params;

  return (
    <RoutePlaceholder
      description="프로젝트 상세와 Architecture Board 진입 계약은 보존되어 있습니다."
      links={[{ href: "/dashboard/projects", label: "프로젝트 연결부" }]}
      title="프로젝트 상세 연결부"
    >
      <p>Project ID: {projectId}</p>
    </RoutePlaceholder>
  );
}

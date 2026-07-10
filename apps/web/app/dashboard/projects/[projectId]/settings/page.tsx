import { RoutePlaceholder } from "../../../../../components/runtime/route-placeholder";

type ProjectSettingsPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

export default async function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
  const { projectId } = await params;

  return (
    <RoutePlaceholder
      description="프로젝트 설정과 Source Repository 연결 계약은 보존되어 있습니다."
      links={[{ href: `/dashboard/projects/${projectId}`, label: "프로젝트 상세 연결부" }]}
      title="프로젝트 설정 연결부"
    >
      <p>Project ID: {projectId}</p>
    </RoutePlaceholder>
  );
}

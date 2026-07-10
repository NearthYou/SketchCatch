import { DesignDashboardPage } from "../../../../features/dashboard/design-dashboard";

type ProjectDetailPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params;

  return <DesignDashboardPage projectId={projectId} view="project-detail" />;
}

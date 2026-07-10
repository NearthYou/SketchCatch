import { ProjectDetailClient } from "../../../../features/dashboard/project-detail-client";

type ProjectDetailPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params;

  return <ProjectDetailClient projectId={projectId} />;
}

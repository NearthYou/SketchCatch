import { DesignDashboardPage } from "../../../../../features/dashboard/design-dashboard";

type ProjectSettingsPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

export default async function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
  const { projectId } = await params;

  return <DesignDashboardPage projectId={projectId} view="project-settings" />;
}
